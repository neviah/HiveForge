// Draft Mode & Preview Enhancement for HiveForge Dashboard
// Injected into index.html to add:
// 1. Mode selector at project creation
// 2. Preview tab showing draft content
// 3. Messages panel for user ↔ agent feedback

(function() {
  const origCreateProject = window.createProject;
  
  // Override createProject to include mode selection
  window.createProject = async function() {
    const name = document.getElementById('project-name').value.trim();
    const template = document.getElementById('project-template').value.trim();
    const goal = document.getElementById('project-goal').value.trim();
    const modeSelect = document.getElementById('project-mode');
    const mode = modeSelect ? modeSelect.value : 'production';
    
    if (!name || !template) {
      alert('Name and template are required');
      return;
    }
    
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, template, goal, mode })
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Error: ' + (data.error || 'Unknown error'));
        return;
      }
      // Clear form
      document.getElementById('project-name').value = '';
      document.getElementById('project-template').value = '';
      document.getElementById('project-goal').value = '';
      if (modeSelect) modeSelect.value = 'production';
      // Refresh projects list
      loadProjects();
    } catch (err) {
      alert('Error creating project: ' + err.message);
    }
  };
  
  // Load and display preview for draft projects
  window.loadPreview = async function(projectId) {
    const previewFrame = document.getElementById('preview-frame');
    if (!previewFrame) {
      alert('Preview frame not found');
      return;
    }
    try {
      const res = await fetch('/api/projects/' + projectId + '/preview');
      if (!res.ok) {
        previewFrame.innerHTML = '<p style="padding:1rem; color:var(--muted);">Preview files not ready yet. Check back in a moment.</p>';
        return;
      }
      const html = await res.text();
      previewFrame.srcdoc = html;
    } catch (err) {
      previewFrame.innerHTML = '<p style="padding:1rem; color:red;">Error loading preview: ' + err.message + '</p>';
    }
  };
  
  // Send feedback to coordinator
  window.sendFeedback = async function(projectId) {
    const input = document.getElementById('feedback-input');
    const message = input.value.trim();
    if (!message) {
      alert('Please enter feedback');
      return;
    }
    try {
      const res = await fetch('/api/projects/' + projectId + '/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, targetAgentRole: 'coordinator' })
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Error: ' + (data.error || 'Unknown error'));
        return;
      }
      input.value = '';
      loadMessages(projectId);
    } catch (err) {
      alert('Error sending feedback: ' + err.message);
    }
  };
  
  // Load project messages/feedback history
  window.loadMessages = async function(projectId) {
    const msgList = document.getElementById('messages-list');
    if (!msgList) return;
    try {
      const res = await fetch('/api/projects/' + projectId + '/messages');
      const data = await res.json();
      if (!data.ok) {
        msgList.innerHTML = '<p class="muted">No messages yet</p>';
        return;
      }
      msgList.innerHTML = data.messages.map((msg) => {
        return `<div class="list-item"><strong>${msg.kind}</strong><br/><small>${msg.ts}</small><br/>${msg.message || msg.targetAgentRole || ''}</div>`;
      }).join('') || '<p class="muted">No messages yet</p>';
    } catch (err) {
      msgList.innerHTML = '<p style="color:red;">Error loading messages</p>';
    }
  };
  
  // Promote draft to production
  window.promoteToDraft = async function(projectId) {
    if (!confirm('Promote this draft to production? Deploy steps will resume.')) return;
    try {
      const res = await fetch('/api/projects/' + projectId + '/promote', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert('Error: ' + (data.error || 'Unknown error'));
        return;
      }
      alert('Project promoted to production!');
      loadProjects();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };
  
  // Add HTML for mode selector to project creation form
  document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('project-form') || document.querySelector('[data-tab="projects"]');
    if (form) {
      // Check if mode selector already exists
      if (!document.getElementById('project-mode')) {
        // Find where to insert it (look for project-goal)
        const goalLabel = form.querySelector('label') || form;
        if (goalLabel.parentElement) {
          const div = document.createElement('div');
          div.style.marginTop = '0.75rem';
          div.innerHTML = `
            <label style="display: block; margin-bottom: 0.35rem; font-weight: 600;">
              Mode:
              <select id="project-mode" style="margin-left: 0.5rem;">
                <option value="production">Production (deploy to Netlify)</option>
                <option value="draft">Draft (preview only, no deploy)</option>
              </select>
            </label>
          `;
          goalLabel.parentElement.insertBefore(div, goalLabel.nextSibling);
        }
      }
    }
  });
})();
