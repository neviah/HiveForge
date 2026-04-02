# claw-code Python Base (Integration Placeholder)

HiveForge is designed to consume the Python workspace from claw-code with minimal modification.

Expected upstream source: https://github.com/ultraworkers/claw-code

Current status:
- Direct clone currently fails with HTTP 403 (repository disabled).
- Temporary local snapshot imported from `D:/pinokio/api/ClawCode_Pinokio.git/app/upstream`.
- Vendored snapshot commit: `95e1290d23d4edd8a9b5ceeccee98f539b3ecb63` (2026-04-01T21:05:52Z, "merge: release/0.1.0").
- HiveForge loop adapter is prepared in `hiveforge/loop/claw_code_adapter.py`.
- Snapshot is available at `hiveforge/third_party/claw_code_upstream/` and can be used immediately.

After upstream git access is restored:
1. Refresh `hiveforge/third_party/claw_code_upstream` from the canonical upstream.
2. Point runtime imports to upstream `src/` modules where needed.
3. Keep HiveForge-specific extensions in `hiveforge/` only.
