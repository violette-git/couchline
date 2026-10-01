// Toolbar popup: opens the sidebar on the current tab when it's Netflix or Hulu.
const toggle = document.getElementById('toggle');
const message = document.getElementById('message');

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab?.id) return;
  // Only tabs running the content script (Netflix and Hulu) answer.
  chrome.tabs.sendMessage(tab.id, { t: 'toggle', open: true }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) return;
    message.textContent = res.inRoom ? `You're in a room on ${res.service}. The sidebar is open.` : `The sidebar is open. Join your room there.`;
    toggle.hidden = false;
    toggle.textContent = 'Hide the sidebar';
    toggle.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { t: 'toggle', open: false }, () => window.close());
    });
  });
});
