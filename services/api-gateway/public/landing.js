const form = document.querySelector('#login-form');
const error = document.querySelector('#login-error');
const dashboardLink = document.querySelector('#open-dashboard');
const destination = `/${window.location.search}`;

async function session() {
  const response = await fetch('/api/session', { credentials: 'same-origin' });
  if (!response.ok) return null;
  return (await response.json()).actor;
}

async function initialize() {
  const actor = await session();
  if (!actor) return;
  form.querySelectorAll('label, button').forEach((element) => { element.hidden = true; });
  dashboardLink.hidden = false;
  dashboardLink.href = destination;
  dashboardLink.textContent = `Continue as ${actor.displayName || actor.actorId}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.hidden = true;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actorId: document.querySelector('#actor-id').value,
        password: document.querySelector('#password').value
      })
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.detail || 'Sign-in failed.');
    }
    window.location.assign(destination);
  } catch (reason) {
    error.textContent = reason.message || 'Sign-in failed.';
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
});

void initialize();
