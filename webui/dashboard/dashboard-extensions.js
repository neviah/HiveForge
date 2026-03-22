// Dashboard Extensions for Draft Mode, Preview, and Messages
// This file adds new sections to the dashboard for:
// - Preview tab (shows draft HTML content in iframe)
// - Messages tab (user ↔ coordinator feedback loop)
// - Promote button (draft → production)

(function() {
  // Extend the dashboard with new tabs
  const origRenderSection = window.renderSection;
  window.renderSection = function(section) {
    if (origRenderSection) origRenderSection(section);
    
    // Add preview and messages tabs for projects
    if (section === 'projects') {
      setTimeout(() => addProjectExtensions(), 100);
    }
  };
  
  function addProjectExtensions() {
    const projectPanel = document.querySelector('[data-section="projects"]');
    if (!projectPanel) return;
    
    // Find project select/list and add controls
    const projectsList = projectPanel.querySelector('.list') || projectPanel.querySelector('[id*="project"]');
    if (!projectsList) return;
    
    // Create message history panel
    const msgPanel = document.createElement('div');
    msgPanel.id = 'messages-panel';
    msgPanel.style.cssText = 'margin-top:1rem; border:1px solid var(--border); border-radius:8px; background:var(--card-bg); padding:1rem; display:none;';
    msgPanel.innerHTML = `
      <h3 style="margin:0 0 0.75rem 0;">Messages & Feedback</h3>
      <div id="messages-list" class="list" style="margin-bottom:0.75rem;"></div>
      <div style="display:flex; gap:0.5rem; flex-direction:column;">
        <textarea id="feedback-input" placeholder="Send feedback to coordinator..." style="min-height:60px;"></textarea>
        <button onclick="window.sendFeedback(window.currentProjectId)" style="align-self:flex-start;">Send Feedback</button>
      </div>
    `;
    
    // Create preview panel
    const prevPanel = document.createElement('div');
    prevPanel.id = 'preview-panel';
    prevPanel.style.cssText = 'margin-top:1rem; border:1px solid var(--border); border-radius:8px; background:var(--card-bg); padding:1rem; display:none;';
    prevPanel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <h3 style="margin:0;">Preview</h3>
        <button onclick="window.loadPreview(window.currentProjectId)" style="padding:0.4rem 0.8rem; font-size:0.85rem;">Refresh</button>
      </div>
      <iframe id="preview-frame" style="width:100%; height:400px; border:1px solid var(--border); border-radius:4px; background:white;"></iframe>
      <button onclick="window.promoteToDraft(window.currentProjectId)" style="margin-top:0.75rem; width:100%;">Promote to Production & Deploy</button>
    `;
    
    projectPanel.appendChild(msgPanel);
    projectPanel.appendChild(prevPanel);
    
    // Update project list click handlers
    const listItems = projectPanel.querySelectorAll('.list-item') || [];
    listItems.forEach((item) => {
      item.addEventListener('click', function() {
        const projectId = this.getAttribute('data-project-id');
        if (projectId) {
          window.currentProjectId = projectId;
          // Try to load project details
          fetch('/api/projects').then(r => r.json()).then((data) => {
            if (data.ok && data.projects) {
              const proj = data.projects.find(p => p.id === projectId);
              if (proj) {
                // Show/hide panels based on mode
                if (proj.mode === 'draft') {
                  document.getElementById('preview-panel').style.display = 'block';
                  document.getElementById('messages-panel').style.display = 'block';
                  window.loadPreview(projectId);
                  window.loadMessages(projectId);
                } else {
                  document.getElementById('preview-panel').style.display = 'none';
                  document.getElementById('messages-panel').style.display = 'none';
                }
              }
            }
          }).catch(() => {});
        }
      });
    });
  }
  
  // Re-wire the functions from draft-preview-enhancement.js if not already defined
  if (!window.sendFeedback) {
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
        window.loadMessages(projectId);
      } catch (err) {
        alert('Error sending feedback: ' + err.message);
      }
    };
  }
  
  if (!window.loadPreview) {
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
  }
  
  if (!window.loadMessages) {
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
        if (data.count === 0) {
          msgList.innerHTML = '<p class="muted">No messages yet</p>';
          return;
        }
        msgList.innerHTML = data.messages.map((msg) => {
          return `<div class="list-item"><strong>${msg.kind}</strong><br/><small style="color:var(--muted);">${msg.ts}</small><div style="margin-top:0.25rem; font-size:0.9rem;">${msg.message || msg.targetAgentRole || ''}</div></div>`;
        }).join('');
      } catch (err) {
        msgList.innerHTML = '<p style="color:red;">Error loading messages</p>';
      }
    };
  }
  
  if (!window.promoteToDraft) {
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
        // Reload projects list
        if (window.loadProjects) window.loadProjects();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    };
  }
})();
