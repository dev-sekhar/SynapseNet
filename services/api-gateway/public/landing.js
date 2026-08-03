const form = document.querySelector('#login-form');
const error = document.querySelector('#login-error');
const dashboardLink = document.querySelector('#open-dashboard');
const walletButton = document.querySelector('#connect-wallet');
const walletStatus = document.querySelector('#wallet-status');
const destination = `/${window.location.search}`;
let walletAddress = null;

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function showWallet(address) {
  walletAddress = address || null;
  walletButton.textContent = walletAddress ? 'Change wallet' : 'Connect MetaMask';
  walletStatus.textContent = walletAddress
    ? `Wallet connected: ${shortAddress(walletAddress)}`
    : 'Connect your wallet, then sign in to your SynapseNet profile.';
  walletStatus.classList.toggle('connected', Boolean(walletAddress));
}

async function connectWallet() {
  error.hidden = true;
  if (!window.ethereum) {
    error.textContent = 'MetaMask was not detected. Install or enable MetaMask and try again.';
    error.hidden = false;
    return;
  }
  walletButton.disabled = true;
  try {
    await window.ethereum.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }]
    });
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    showWallet(accounts?.[0]);
  } catch (reason) {
    if (reason?.code === 4001) {
      showWallet(null);
      walletStatus.textContent = 'Wallet connection cancelled. You can try again when ready.';
    } else {
      error.textContent = reason?.message || 'MetaMask connection failed.';
      error.hidden = false;
    }
  } finally {
    walletButton.disabled = false;
  }
}

async function session() {
  const response = await fetch('/api/session', { credentials: 'same-origin' });
  if (!response.ok) return null;
  return (await response.json()).actor;
}

async function initialize() {
  if (window.ethereum) {
    showWallet(null);
    window.ethereum.on?.('accountsChanged', (nextAccounts) => {
      if (walletAddress) showWallet(nextAccounts?.[0]);
    });
  }
  const actor = await session();
  if (!actor) return;
  form.querySelectorAll('label, button').forEach((element) => { element.hidden = true; });
  dashboardLink.hidden = false;
  dashboardLink.href = destination;
  dashboardLink.textContent = `Continue as ${actor.displayName || actor.actorId}`;
}

walletButton.addEventListener('click', connectWallet);

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
