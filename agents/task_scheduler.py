from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Set
import uuid


TASK_BACKLOG = "backlog"
TASK_INPROGRESS = "inprogress"
TASK_REVIEW = "review"
TASK_DONE = "done"


@dataclass(slots=True)
class ScheduledTask:
    title: str
    description: str
    task_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    assignee_id: Optional[str] = None
    depends_on: Set[str] = field(default_factory=set)
    status: str = TASK_BACKLOG
    blocked_reason: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TaskScheduler:
    """Simple dependency-aware in-memory scheduler.

    This is intentionally lightweight for scaffolding and will later be backed
    by persistent project storage.
    """

    def __init__(self) -> None:
        self.tasks: Dict[str, ScheduledTask] = {}

    def add_task(
        self,
        title: str,
        description: str,
        assignee_id: Optional[str] = None,
        depends_on: Optional[Iterable[str]] = None,
    ) -> ScheduledTask:
        dependency_ids = set(depends_on or [])
        task = ScheduledTask(
            title=title,
            description=description,
            assignee_id=assignee_id,
            depends_on=dependency_ids,
        )
        self.tasks[task.task_id] = task
        self._update_block_state(task)
        return task

    def assign(self, task_id: str, assignee_id: str) -> None:
        task = self.tasks[task_id]
        task.assignee_id = assignee_id
        task.updated_at = datetime.now(timezone.utc).isoformat()

    def mark_inprogress(self, task_id: str) -> None:
        task = self.tasks[task_id]
        if task.status == TASK_BACKLOG and self.is_unblocked(task_id):
            task.status = TASK_INPROGRESS
            task.blocked_reason = None
            task.updated_at = datetime.now(timezone.utc).isoformat()

    def mark_review(self, task_id: str) -> None:
        task = self.tasks[task_id]
        task.status = TASK_REVIEW
        task.updated_at = datetime.now(timezone.utc).isoformat()

    def mark_done(self, task_id: str) -> None:
        task = self.tasks[task_id]
        task.status = TASK_DONE
        task.blocked_reason = None
        task.updated_at = datetime.now(timezone.utc).isoformat()
        self.refresh_blockers()

    def is_unblocked(self, task_id: str) -> bool:
        task = self.tasks[task_id]
        for dep_id in task.depends_on:
            dep = self.tasks.get(dep_id)
            if not dep or dep.status != TASK_DONE:
                return False
        return True

    def next_runnable(self) -> List[ScheduledTask]:
        runnable: List[ScheduledTask] = []
        for task in self.tasks.values():
            if task.status == TASK_BACKLOG and self.is_unblocked(task.task_id):
                runnable.append(task)
        return sorted(runnable, key=lambda t: t.created_at)

    def refresh_blockers(self) -> None:
        for task in self.tasks.values():
            self._update_block_state(task)

    def _update_block_state(self, task: ScheduledTask) -> None:
        if task.status != TASK_BACKLOG:
            task.blocked_reason = None
            return
        missing = [dep for dep in task.depends_on if self.tasks.get(dep, None) is None]
        pending = [dep for dep in task.depends_on if dep in self.tasks and self.tasks[dep].status != TASK_DONE]
        if missing:
            task.blocked_reason = "Missing dependency task(s)"
        elif pending:
            task.blocked_reason = "Waiting on dependency completion"
        else:
            task.blocked_reason = None
        task.updated_at = datetime.now(timezone.utc).isoformat()

    def snapshot(self) -> List[dict]:
        return [
            {
                "task_id": t.task_id,
                "title": t.title,
                "description": t.description,
                "assignee_id": t.assignee_id,
                "depends_on": sorted(t.depends_on),
                "status": t.status,
                "blocked_reason": t.blocked_reason,
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
            for t in sorted(self.tasks.values(), key=lambda item: item.created_at)
        ]
