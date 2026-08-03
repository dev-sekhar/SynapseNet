const connectButtons = [...document.querySelectorAll('[data-connect-wallet]')];
const error = document.querySelector('#login-error');
const walletStatus = document.querySelector('#wallet-status');
const apiBase = 'http://localhost:8000/api';

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function encodeMessage(message) {
  return `0x${[...new TextEncoder().encode(message)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function setBusy(busy) {
  connectButtons.forEach((button) => { button.disabled = busy; });
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new Error(problem.detail || 'Wallet authentication failed.');
  }
  return response.status === 204 ? null : response.json();
}

async function connectWallet() {
  error.hidden = true;
  if (!window.ethereum) {
    error.textContent = 'MetaMask was not detected. Install or enable MetaMask and try again.';
    error.hidden = false;
    return;
  }
  setBusy(true);
  try {
    await window.ethereum.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }]
    });
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    const address = accounts?.[0];
    if (!address) throw new Error('MetaMask did not provide an account.');
    walletStatus.textContent = `Verify ${shortAddress(address)} in MetaMask to continue.`;
    const challenge = await api('/v2/auth/wallet/challenge', {
      method: 'POST', body: JSON.stringify({ address })
    });
    const signature = await window.ethereum.request({
      method: 'personal_sign', params: [encodeMessage(challenge.message), address]
    });
    await api('/v2/auth/wallet/verify', {
      method: 'POST', body: JSON.stringify({ address, signature })
    });
    await api('/v2/auth/wallet/actor');
    walletStatus.textContent = `Wallet verified: ${shortAddress(address)}`;
    window.location.assign('/?wallet=1');
  } catch (reason) {
    if (reason?.code === 4001) {
      walletStatus.textContent = 'Wallet connection cancelled. Connect when you are ready.';
    } else {
      error.textContent = reason?.message || 'Wallet authentication failed.';
      error.hidden = false;
      walletStatus.textContent = 'Connect MetaMask to enter your verified SynapseNet profile.';
    }
  } finally {
    setBusy(false);
  }
}

connectButtons.forEach((button) => button.addEventListener('click', connectWallet));
