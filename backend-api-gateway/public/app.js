const $ = (selector) => document.querySelector(selector);
const status = $('#network-status');
const toast = $('#toast');
let state = {
  users: [],
  enterprises: [],
  directory: [],
  credentialRequests: [],
  wallet: [],
  walletAccount: null,
  walletRequests: [],
  tokenTransactions: []
};
let actor = null;
const api = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 65000
});

class ApiProblem extends Error {
  constructor(problem, fallbackMessage) {
    super(problem?.detail || fallbackMessage || 'The request could not be completed.');
    this.name = 'ApiProblem';
    this.title = problem?.title || 'Request failed';
    this.status = problem?.status;
    this.traceId = problem?.traceId;
    this.errors = problem?.errors || [];
  }
}

function notify(message, error = false) {
  if (error) return handleError(message);
  toast.textContent = message;
  toast.className = 'show';
  window.clearTimeout(notify.timeout);
  notify.timeout = window.setTimeout(() => { toast.className = ''; }, 5000);
}

async function request(url, options) {
  try {
    const response = await api.request({
      url,
      method: options?.method || 'GET',
      data: options?.body ? JSON.parse(options.body) : undefined
    });
    return response.data;
  } catch (error) {
    if (error instanceof ApiProblem) throw error;
    throw new ApiProblem(
      error.response?.data,
      error.code === 'ECONNABORTED' ? 'The request timed out.' : error.message
    );
  }
}

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(new ApiProblem(error.response?.data, error.message))
);

function handleError(error) {
  const problem = error instanceof Error
    ? error
    : new ApiProblem(null, String(error));
  $('#error-title').textContent = problem.title || 'Something went wrong';
  $('#error-detail').textContent = `${problem.message}${problem.traceId ? ` · Trace ${problem.traceId}` : ''}`;
  const fields = $('#error-fields');
  fields.replaceChildren(...(problem.errors || []).map((item) => {
    const entry = document.createElement('li');
    entry.textContent = `${item.field || 'field'}: ${item.message}`;
    return entry;
  }));
  $('#error-panel').hidden = false;
  $('#error-panel').focus();
}

$('#dismiss-error').addEventListener('click', () => { $('#error-panel').hidden = true; });
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  handleError(event.reason);
});
window.addEventListener('error', (event) => handleError(event.error || event.message));

function option(value, label) {
  const item = document.createElement('option');
  item.value = value;
  item.textContent = label;
  return item;
}

function fillSelect(selector, items, valueKey, labelKey, placeholder) {
  const select = $(selector);
  const selected = select.value;
  select.replaceChildren(option('', placeholder), ...items.map((item) =>
    option(item[valueKey], item[labelKey])
  ));
  if ([...select.options].some((item) => item.value === selected)) select.value = selected;
}

function credentialCard(credential, selectable = false) {
  const card = document.createElement('article');
  card.className = 'credential-card';
  const heading = document.createElement('h3');
  heading.textContent = credential.title;
  const meta = document.createElement('p');
  meta.textContent = `${credential.credentialType} · Issued by ${credential.issuerEnterpriseId}`;
  const approval = document.createElement('small');
  approval.textContent = `Approved by ${credential.approvedBy}`;
  card.append(heading, meta, approval);
  if (selectable) {
    const choice = document.createElement('label');
    choice.className = 'credential-choice';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'credential';
    checkbox.value = credential.credentialId;
    choice.append(checkbox, document.createTextNode(' Include in share'));
    card.prepend(choice);
  }
  return card;
}

function renderCredentialActivity(requests, targetSelector) {
  const target = $(targetSelector);
  if (!requests.length) {
    target.innerHTML = '<div class="empty">No credential activity yet.</div>';
    return;
  }
  target.replaceChildren(...requests.map((item) => {
    const card = document.createElement('article');
    card.className = 'credential-card';
    const pill = document.createElement('span');
    pill.className = `pill status-${item.status}`;
    pill.textContent = item.status.replace('_validation', '');
    const title = document.createElement('h3');
    title.textContent = item.title;
    const meta = document.createElement('p');
    meta.textContent = `${item.credentialType} · ${item.enterpriseId} · Owner ${item.userId}`;
    const details = document.createElement('small');
    const structured = Object.entries(item.details || {})
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n') || 'No structured details';
    const evidence = (item.evidence || []).map((entry) =>
      `Evidence: ${entry.documentType} · ${entry.fileName} · ${entry.contentHash}`
    ).join('\n');
    details.textContent = `${structured}${evidence ? `\n${evidence}` : ''}`;
    card.append(pill, title, meta, details);
    return card;
  }));
}

function renderTokenTransactions(transactions, targetSelector) {
  const target = $(targetSelector);
  if (!transactions.length) {
    target.innerHTML = '<div class="empty">No token transactions yet.</div>';
    return;
  }
  target.replaceChildren(...transactions.map((transaction) => {
    const row = document.createElement('article');
    row.className = 'token-transaction';
    const type = document.createElement('span');
    type.className = `token-transaction-type token-${transaction.transactionType}`;
    type.textContent = transaction.transactionType;
    const description = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = transaction.description;
    const date = document.createElement('small');
    date.textContent = new Date(Number(transaction.createdAt) * 1000).toLocaleString();
    description.append(heading, date);
    const amount = document.createElement('b');
    amount.textContent = `${transaction.transactionType === 'issued' ? '+' : '−'}${transaction.amount} SNT`;
    const balance = document.createElement('small');
    balance.textContent = `${transaction.balanceAfter} available`;
    row.append(type, description, amount, balance);
    return row;
  }));
}

function renderReviewQueue() {
  const queue = $('#review-queue');
  const pending = state.credentialRequests.filter((item) => item.status === 'pending_validation');
  if (!pending.length) {
    queue.innerHTML = '<div class="empty">No requests awaiting enterprise validation.</div>';
    return;
  }
  queue.replaceChildren(...pending.map((item) => {
    const enterprise = state.enterprises.find((value) => value.enterpriseId === item.enterpriseId);
    const card = document.createElement('article');
    card.className = 'credential-card review-card';
    const evidence = item.evidence.map((value) =>
      `${value.documentType}: ${value.fileName} · ${value.contentHash.slice(0, 22)}…`
    ).join('\n');
    card.innerHTML = `<span class="pill">pending</span><h3></h3><p></p><small></small>`;
    card.querySelector('h3').textContent = item.title;
    card.querySelector('p').textContent = `${item.credentialType} for ${item.userId} · ${enterprise?.name || item.enterpriseId}`;
    card.querySelector('small').textContent = evidence || 'No evidence attached';
    const form = document.createElement('form');
    form.className = 'review-actions';
    const notes = document.createElement('input');
    notes.placeholder = 'Decision notes';
    const approve = document.createElement('button');
    approve.type = 'submit';
    approve.value = 'approve';
    approve.textContent = 'Approve';
    const reject = document.createElement('button');
    reject.type = 'submit';
    reject.value = 'reject';
    reject.className = 'reject';
    reject.textContent = 'Reject';
    form.append(notes, approve, reject);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const decision = event.submitter.value;
      try {
        await request(`/api/credential-requests/${encodeURIComponent(item.requestId)}/review`, {
          method: 'POST',
          body: JSON.stringify({ decision, notes: notes.value })
        });
        notify(`Credential ${decision === 'approve' ? 'approved and added to wallet' : 'rejected'}.`);
        await loadBootstrap();
        await loadWallet();
      } catch (error) {
        handleError(error);
      }
    });
    card.append(form);
    return card;
  }));
}

async function loadBootstrap() {
  try {
    state = { ...state, ...await request('/api/bootstrap') };
    $('#user-count').textContent = state.users.length;
    $('#enterprise-count').textContent = state.enterprises.length;
    $('#request-count').textContent = state.credentialRequests.length;
    fillSelect('#credential-enterprise', state.enterprises, 'enterpriseId', 'name', 'Choose enterprise');
    $('#recipient-directory').replaceChildren(...state.directory.map((user) =>
      option(user.userId, `${user.displayName} (${user.userId})`)
    ));
    renderReviewQueue();
    status.className = 'status online';
    status.querySelector('span').textContent = 'synapsenet online';
  } catch (error) {
    status.className = 'status offline';
    status.querySelector('span').textContent = 'Gateway offline';
    handleError(error);
  }
}

function showSession(nextActor) {
  actor = nextActor;
  $('#auth-view').hidden = Boolean(actor);
  document.querySelectorAll('.marketing-view').forEach((item) => { item.hidden = Boolean(actor); });
  $('#actor-chip').hidden = !actor;
  $('#logout').hidden = !actor;
  $('#user-dashboard').hidden = actor?.role !== 'user';
  $('#reviewer-dashboard').hidden = actor?.role !== 'reviewer';
  if (!actor) return;
  $('#actor-chip').textContent = `${actor.displayName} · ${actor.role}`;
  if (actor.role === 'user') {
    $('#user-greeting').textContent = `${actor.displayName}'s credential wallet`;
  } else {
    $('#reviewer-greeting').textContent = `${actor.displayName} validation queue`;
  }
}

const typeFieldSets = {
  skill: [
    ['Skill level', 'level', 'select', ['Beginner', 'Intermediate', 'Advanced', 'Expert']],
    ['Years of experience', 'yearsExperience', 'number'],
    ['Last used', 'lastUsed', 'date'],
    ['How the skill was applied', 'application', 'textarea']
  ],
  role: [
    ['Organization', 'organization', 'text'],
    ['Job title', 'jobTitle', 'text'],
    ['Department or team', 'department', 'text'],
    ['Employment type', 'employmentType', 'select', ['Full-time', 'Part-time', 'Contract', 'Internship']],
    ['Start date', 'startDate', 'date'],
    ['End date', 'endDate', 'date'],
    ['Responsibilities and achievements', 'responsibilities', 'textarea']
  ],
  education: [
    ['Institution', 'institution', 'text'],
    ['Program or degree', 'program', 'text'],
    ['Field of study', 'fieldOfStudy', 'text'],
    ['Start date', 'startDate', 'date'],
    ['Completion date', 'completionDate', 'date'],
    ['Grade or distinction', 'grade', 'text']
  ],
  certificate: [
    ['Issuing organization', 'issuer', 'text'],
    ['Certificate number', 'certificateNumber', 'text'],
    ['Issue date', 'issueDate', 'date'],
    ['Expiry date', 'expiryDate', 'date'],
    ['Credential URL', 'credentialUrl', 'url']
  ],
  other: [
    ['Category', 'category', 'text'],
    ['Date', 'date', 'date'],
    ['Description', 'description', 'textarea']
  ]
};

function renderTypeFields() {
  const container = $('#type-fields');
  container.replaceChildren(...typeFieldSets[$('#credential-type').value].map(([label, name, type, choices]) => {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    let input;
    if (type === 'textarea') input = document.createElement('textarea');
    else if (type === 'select') {
      input = document.createElement('select');
      input.append(option('', 'Choose'), ...choices.map((choice) => option(choice, choice)));
    } else {
      input = document.createElement('input');
      input.type = type;
    }
    input.dataset.detail = name;
    input.required = !['endDate', 'expiryDate', 'credentialUrl'].includes(name);
    wrapper.append(input);
    return wrapper;
  }));
}

function structuredDetails() {
  return Object.fromEntries([...document.querySelectorAll('[data-detail]')]
    .filter((input) => input.value)
    .map((input) => [input.dataset.detail, input.value]));
}

async function hashFile(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return `sha256:${[...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`;
}

$('#evidence-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  $('#content-hash').value = 'Calculating…';
  try {
    $('#content-hash').value = await hashFile(file);
    if (!$('#document-type').value) $('#document-type').value = file.type || 'document';
    notify('SHA-256 calculated locally. The file was not uploaded by SynapseNet.');
  } catch {
    $('#content-hash').value = '';
    notify('Unable to hash this file in the browser.', true);
  }
});

function bindLedgerForm(selector, endpoint, successMessage, body) {
  $(selector).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await request(endpoint, { method: 'POST', body: JSON.stringify(body()) });
      form.reset();
      notify(successMessage);
      if (actor) await loadBootstrap();
      if (selector === '#credential-form') renderTypeFields();
    } catch (error) {
      handleError(error);
    } finally {
      button.disabled = false;
    }
  });
}

bindLedgerForm('#user-form', '/api/users', 'User registered. Sign in with the new User ID.', () => ({
  userId: $('#user-id').value,
  displayName: $('#display-name').value,
  password: $('#user-password').value
}));

bindLedgerForm('#enterprise-form', '/api/enterprises', 'Enterprise registered. Sign in with the reviewer ID.', () => ({
  enterpriseId: $('#enterprise-id').value,
  name: $('#enterprise-name').value,
  reviewerId: $('#reviewer-id').value,
  reviewerName: $('#reviewer-name').value,
  password: $('#reviewer-password').value
}));

bindLedgerForm(
  '#credential-form',
  '/api/credential-requests',
  'Credential sent to the selected enterprise for validation.',
  () => {
    const file = $('#evidence-file').files[0];
    return {
      enterpriseId: $('#credential-enterprise').value,
      credentialType: $('#credential-type').value,
      title: $('#credential-title').value,
      details: structuredDetails(),
      evidence: [{
        evidenceId: `evidence-${crypto.randomUUID()}`,
        documentType: $('#document-type').value,
        fileName: file?.name || 'external-document',
        contentHash: $('#content-hash').value,
        storageProvider: $('#storage-provider').value,
        storageReference: $('#storage-reference').value
      }]
    };
  }
);

async function loadWallet() {
  try {
    await request('/api/wallet/open', { method: 'POST' });
    const result = await request('/api/wallet');
    state.wallet = result.credentials;
    state.walletAccount = result.wallet;
    state.walletRequests = result.credentialRequests;
    state.tokenTransactions = result.tokenTransactions;
    const prefix = actor.role === 'user' ? 'user' : 'enterprise';
    $(`#${prefix}-wallet-id`).textContent =
      `${result.wallet.walletId} · ${actor.role === 'user' ? actor.actorId : actor.enterpriseId}`;
    $(`#${prefix}-approved-count`).textContent = result.credentialSummary.approved;
    $(`#${prefix}-pending-count`).textContent = result.credentialSummary.pending;
    $(`#${prefix}-rejected-count`).textContent = result.credentialSummary.rejected;
    $(`#${prefix}-total-count`).textContent = result.credentialSummary.total;
    $(`#${prefix}-token-issued`).textContent = result.wallet.tokenIssued.toLocaleString();
    $(`#${prefix}-token-used`).textContent = result.wallet.tokenUsed.toLocaleString();
    $(`#${prefix}-token-burnt`).textContent = result.wallet.tokenBurnt.toLocaleString();
    $(`#${prefix}-token-available`).textContent = result.wallet.tokenAvailable.toLocaleString();
    renderCredentialActivity(
      result.credentialRequests,
      actor.role === 'user' ? '#user-all-credentials' : '#issued-credentials'
    );
    renderTokenTransactions(
      result.tokenTransactions,
      actor.role === 'user' ? '#user-token-transactions' : '#enterprise-token-transactions'
    );
    if (actor.role === 'user') {
      const wallet = $('#wallet');
      wallet.replaceChildren(...result.credentials.map((item) => credentialCard(item, true)));
      if (!result.credentials.length) {
        wallet.innerHTML = '<div class="empty">No approved credentials in this wallet.</div>';
      }
    } else {
      // Enterprise credential details are rendered from all request states above.
    }
  } catch (error) {
    handleError(error);
  }
}

$('#share-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const credentialIds = [...document.querySelectorAll('input[name="credential"]:checked')]
    .map((item) => item.value);
  try {
    const result = await request('/api/shares', {
      method: 'POST',
      body: JSON.stringify({
        credentialIds,
        recipient: $('#share-recipient').value,
        purpose: $('#share-purpose').value,
        validFrom: new Date($('#share-from').value).toISOString(),
        expiresAt: new Date($('#share-until').value).toISOString()
      })
    });
    $('#share-qr').src = result.qrDataUrl;
    $('#share-link').href = result.shareUrl;
    $('#share-link').textContent = result.shareUrl;
    $('#share-result').hidden = false;
    notify('Selective wallet share committed to the ledger.');
  } catch (error) {
    handleError(error);
  }
});

async function loadSharedView() {
  const shareId = new URLSearchParams(location.search).get('share');
  if (!shareId) return;
  try {
    const result = await request(`/api/shares/${encodeURIComponent(shareId)}`);
    $('#shared-view').hidden = false;
    $('#share-context').textContent =
      `Shared with ${result.grant.recipient} for ${result.grant.purpose}. Expires ${new Date(result.grant.expiresAt).toLocaleString()}.`;
    $('#shared-credentials').replaceChildren(...result.credentials.map((item) => credentialCard(item)));
    $('#shared-view').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    handleError(error);
  }
}

$('#credential-type').addEventListener('change', renderTypeFields);

document.querySelectorAll('[data-wallet-panel]').forEach((card) => {
  card.setAttribute('aria-expanded', 'false');
  card.addEventListener('click', () => {
    const panel = $(`#${card.dataset.walletPanel}`);
    const willOpen = panel.hidden;
    document.querySelectorAll('.wallet-detail-panel').forEach((item) => {
      item.hidden = true;
    });
    document.querySelectorAll('[data-wallet-panel]').forEach((item) => {
      item.setAttribute('aria-expanded', 'false');
    });
    panel.hidden = !willOpen;
    card.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await request('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        actorId: $('#login-id').value,
        password: $('#login-password').value
      })
    });
    showSession(result.actor);
    await loadBootstrap();
    await loadWallet();
    await loadSharedView();
    notify(`Welcome, ${actor.displayName}.`);
  } catch (error) {
    handleError(error);
  }
});

$('#request-reset-token').addEventListener('click', async () => {
  const actorId = $('#reset-id').value.trim();
  if (!actorId) {
    return handleError(new ApiProblem({
      title: 'Login ID required',
      detail: 'Enter your user or enterprise reviewer login ID first.',
      status: 422
    }));
  }
  const button = $('#request-reset-token');
  button.disabled = true;
  try {
    const result = await request('/api/password/request', {
      method: 'POST',
      body: JSON.stringify({ actorId })
    });
    $('#reset-token').value = result.developmentToken;
    notify('One-time token generated and filled in. Choose a new password.');
  } catch (error) {
    handleError(error);
  } finally {
    button.disabled = false;
  }
});

$('#reset-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = $('#reset-password').value;
  if (password !== $('#reset-confirm').value) {
    return handleError(new ApiProblem({
      title: 'Passwords do not match',
      detail: 'Enter the same new password in both password fields.',
      status: 422
    }));
  }
  try {
    await request('/api/password/reset', {
      method: 'POST',
      body: JSON.stringify({
        actorId: $('#reset-id').value,
        token: $('#reset-token').value,
        password
      })
    });
    form.reset();
    notify('Password set successfully. You can now sign in.');
  } catch (error) {
    handleError(error);
  }
});

$('#logout').addEventListener('click', async () => {
  await request('/api/logout', { method: 'POST' });
  state = {
    users: [],
    enterprises: [],
    directory: [],
    credentialRequests: [],
    wallet: [],
    walletAccount: null,
    walletRequests: [],
    tokenTransactions: []
  };
  showSession(null);
  notify('Signed out.');
});

async function initialize() {
  renderTypeFields();
  const authView = $('#auth-view');
  authView.parentElement.insertBefore(authView, document.querySelector('.quick-guide'));
  try {
    actor = (await request('/api/session')).actor;
    showSession(actor);
    if (actor) {
      await loadBootstrap();
      await loadWallet();
      await loadSharedView();
    } else {
      status.className = 'status online';
      status.querySelector('span').textContent = 'Ready';
    }
  } catch (error) {
    handleError(error);
  }
}

initialize();
