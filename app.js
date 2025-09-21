// Psundai Dapp frontend logic (no JSON imports, oracle check optional)
// This file is an ES module loaded by index.html with: <script type="module" src="./app.js"></script>

// ===== Contract addresses =====
const TOKEN_ADDRESS = "0xe765b3853a5c53C132e885Eb327Ae2e8bFc158Eb"; // pSUNDAI
const VAULT_ADDRESS = "0x4d80D612e622F6895D2F8e31067225E87F0De0af"; // PegVault

// ===== Minimal ABIs (inline to avoid JSON module imports) =====
const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const VAULT_ABI = [
  {"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"deposit","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"depositPLS","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"repay","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"withdrawPLS","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"getVaultInfo","outputs":[{"internalType":"uint256","name":"collateral","type":"uint256"},{"internalType":"uint256","name":"debt","type":"uint256"},{"internalType":"uint256","name":"ratio","type":"uint256"},{"internalType":"bool","name":"isSafe","type":"bool"},{"internalType":"uint256","name":"liquidationPrice","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"maxMintable","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"user","type":"address"}],"name":"withdrawable","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"WITHDRAW_COOLDOWN","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"vaults","outputs":[{"internalType":"uint256","name":"collateral","type":"uint256"},{"internalType":"uint256","name":"debt","type":"uint256"},{"internalType":"uint256","name":"unsafeTime","type":"uint256"},{"internalType":"uint256","name":"lastLiquidatedTime","type":"uint256"},{"internalType":"uint256","name":"lastDepositTime","type":"uint256"},{"internalType":"uint256","name":"lastWithdrawTime","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"wpls","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}
];

// ===== PulseChain params (for switch button) =====
const PULSECHAIN = {
  chainId: "0x171", // 369
  chainName: "PulseChain",
  nativeCurrency: { name: "Pulse", symbol: "PLS", decimals: 18 },
  rpcUrls: ["https://rpc.pulsechain.com"],
  blockExplorerUrls: ["https://scan.pulsechain.com"],
};

// ===== State =====
let provider, signer, acct, tokenC, vaultC;
let tokenDecimals = 18;

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const setStatus = (m, kind) => { const el = $("status"); if (!el) return; el.textContent = m; el.style.color = kind==='error' ? '#ff6b6b' : (kind==='success' ? '#4ade80' : '#e8eaed'); };
const fmt = (v, dec = 18) => { try { return ethers.formatUnits(v ?? 0n, dec); } catch { return '0'; } };
const parse = (s, dec = 18) => ethers.parseUnits((s||'0').trim(), dec);

// cooldown helpers
let CD_SECONDS = 0; let depEndTs = 0; let wdrawEndTs = 0; let cdTimerId = null;
const toSec = (x) => Number(x ?? 0);
const fmtDur = (ms) => { if (ms<=0) return 'ready'; const s=Math.ceil(ms/1000); const m=Math.floor(s/60); const r=s%60; if (m>=60){const h=Math.floor(m/60),mm=m%60; return `${h}h ${mm}m ${r}s`;} if (m>0) return `${m}m ${r}s`; return `${r}s`; };
const startCountdown = () => { if (cdTimerId) clearInterval(cdTimerId); cdTimerId = setInterval(() => { const now=Date.now(); const depMs=depEndTs?Math.max(depEndTs*1000-now,0):0; const wdMs=wdrawEndTs?Math.max(wdrawEndTs*1000-now,0):0; const nd=$("vCooldown"); if (nd) nd.textContent = fmtDur(Math.max(depMs, wdMs)); if (depMs===0 && wdMs===0){ clearInterval(cdTimerId); cdTimerId=null; } },1000); };

// ===== Wallet actions =====
async function connect() {
  try {
    if (!window.ethereum) return setStatus('No wallet found. Use MetaMask/OKX and open via http://localhost', 'error');
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.BrowserProvider(window.ethereum, 'any');
    signer = await provider.getSigner();
    acct = await signer.getAddress();
    const net = await provider.getNetwork();
    $("net").textContent = (net?.name || 'Chain') + ' (#' + Number(net.chainId) + ')';
    tokenC = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    vaultC = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);
    $("tokenAddr").textContent = TOKEN_ADDRESS;
    $("vaultAddr").textContent = VAULT_ADDRESS;
    setStatus('Connected: ' + acct, 'success');
    window.ethereum.on('chainChanged', () => location.reload());
    window.ethereum.on('accountsChanged', () => location.reload());
  } catch (e) { setStatus(e.message || 'Connect failed', 'error'); }
}

async function switchToPulse() {
  if (!window.ethereum) return setStatus('No wallet', 'error');
  try {
    await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId:PULSECHAIN.chainId }] });
  } catch (e) {
    if (e.code === 4902 || (e.message||'').includes('Unrecognized chain')) {
      await window.ethereum.request({ method:'wallet_addEthereumChain', params:[PULSECHAIN] });
    } else setStatus(e.message || 'Switch failed', 'error');
  }
}

// ===== Reads =====
async function refreshInfo() {
  try {
    if (!tokenC || !vaultC) return setStatus('Connect first', 'error');

    // isOracleHealthy may not exist -> safe fallback
    const okPromise = typeof vaultC.isOracleHealthy === 'function' ? vaultC.isOracleHealthy() : Promise.resolve(true);

    const [name, symbol, dec, total, myBal, vInfo, maxM, wd, ok, vaultRecord, cooldownSec] = await Promise.all([
      tokenC.name(), tokenC.symbol(), tokenC.decimals(), tokenC.totalSupply(), tokenC.balanceOf(acct),
      vaultC.getVaultInfo(acct), vaultC.maxMintable(acct), vaultC.withdrawable(acct), okPromise,
      vaultC.vaults(acct), vaultC.WITHDRAW_COOLDOWN()
    ]);

    tokenDecimals = Number(dec);
    $("tokenMeta").textContent = `${name} (${symbol}), decimals ${tokenDecimals}`;
    $("totalSupply").textContent = fmt(total, tokenDecimals);
    $("myPS").textContent = fmt(myBal, tokenDecimals);
    $("vColl").textContent = fmt(vInfo.collateral ?? vInfo[0], 18);
    $("vDebt").textContent = fmt(vInfo.debt ?? vInfo[1], tokenDecimals);
    $("vRatio").textContent = `${(vInfo.ratio ?? vInfo[2])} / ${(vInfo.isSafe ?? vInfo[3]) ? 'safe' : 'risk'}`;
    $("vLiq").textContent = (vInfo.liquidationPrice ?? vInfo[4])?.toString?.();
    $("out_max").textContent = fmt(maxM, tokenDecimals) + (ok ? '' : ' (oracle issue)');

    // cooldowns
    CD_SECONDS = toSec(cooldownSec);
    const lastDep = toSec(vaultRecord.lastDepositTime ?? vaultRecord[4] ?? 0);
    const lastWd  = toSec(vaultRecord.lastWithdrawTime ?? vaultRecord[5] ?? 0);
    depEndTs   = lastDep ? lastDep + CD_SECONDS : 0;
    wdrawEndTs = lastWd  ? lastWd  + CD_SECONDS : 0;
    const nowMs = Date.now();
    $("vCooldown").textContent = fmtDur(Math.max(depEndTs?depEndTs*1000-nowMs:0, wdrawEndTs?wdrawEndTs*1000-nowMs:0));
    startCountdown();

    setStatus('Info refreshed');
  } catch (e) { setStatus(e.message || 'Read failed', 'error'); }
}

// ===== Tx helper =====
async function handleTx(promise) {
  try {
    const tx = await promise; setStatus('Pending: ' + tx.hash);
    const r = await tx.wait(); setStatus('Confirmed in block ' + r.blockNumber, 'success');
    await refreshInfo();
  } catch (e) { setStatus(e?.shortMessage || e?.message || 'Tx failed', 'error'); }
}

// ===== Step handlers =====
$("btnConnect").onclick = connect; $("s1_connect").onclick = connect;
$("btnSwitch").onclick = switchToPulse; $("s2_switch").onclick = switchToPulse;
$("s3_refresh").onclick = refreshInfo; $("s13_refresh").onclick = refreshInfo;

$("s4_wplsApprove").onclick = async () => {
  if (!vaultC) return setStatus('Connect first','error');
  try {
    const wplsAddr = await vaultC.wpls();
    const amt = parse($("s4_wplsApproveAmt").value, 18);
    const erc20 = new ethers.Contract(wplsAddr, ["function approve(address,uint256) returns (bool)"], signer);
    await handleTx(erc20.approve(VAULT_ADDRESS, amt));
  } catch (e){ setStatus(e.message,'error'); }
};

$("s5_depositWPLS").onclick = async () => {
  if (!vaultC) return setStatus('Connect first','error');
  const amt = parse($("s5_depWPLS").value, 18);
  await handleTx(vaultC.deposit(amt));
};

$("s6_depositPLS").onclick = async () => {
  if (!vaultC) return setStatus('Connect first','error');
  const val = parse($("s6_depPLS").value, 18);
  await handleTx(vaultC.depositPLS({ value: val }));
};

$("s7_maxMint").onclick = async () => {
  if (!vaultC) return setStatus('Connect first','error');
  const m = await vaultC.maxMintable(acct);
  $("out_max").textContent = fmt(m, tokenDecimals);
};

$("s8_mint").onclick = async () => {
  if (!vaultC) return setStatus('Connect first','error');
  const amt = parse($("s8_mintAmt").value, tokenDecimals);
  await handleTx(vaultC.mint(amt));
};

$("s9_psApprove").onclick = async () => {
  if (!tokenC) return setStatus('Connect first','error');
  try {
    const raw = ($("s9_psApproveAmt").value || '0').trim();
    const amt = raw.toLowerCase() === 'max' ? (2n**256n - 1n) : parse(raw, tokenDecimals);
    await handleTx(tokenC.approve(VAULT_ADDRESS, amt));
  } catch (e) { setStatus(e.message,'error'); }
};

$("s10_repay").onclick = async () => {
  if (!vaultC) return setStatus('Connect first','error');
  const amt = parse($("s10_repayAmt").value, tokenDecimals);
  await handleTx(vaultC.repay(amt));
};

$("s11_withdrawWPLS").onclick = async () => {
  if (!vaultC) return setStatus('Connect first','error');
  const amt = parse($("s11_wdrawWPLS").value, 18);
  await handleTx(vaultC.withdraw(amt));
};

$("s12_withdrawPLS").onclick = async () => {
  if (!vaultC) return setStatus('Connect first','error');
  const amt = parse($("s12_wdrawPLS").value, 18);
  await handleTx(vaultC.withdrawPLS(amt));
};

// Prefill addresses
$("tokenAddr").textContent = TOKEN_ADDRESS;
$("vaultAddr").textContent = VAULT_ADDRESS;

// file:// warning
if (location.protocol === 'file:') {
  setStatus('Open this page via http://localhost — wallets do not inject on file://', 'error');
}