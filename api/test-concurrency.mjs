
const BASE_URL = 'http://localhost:3000/api/v1';
const VARIANT_ID = '1efe033d-f2f2-458c-8f02-3b7de765f663';

async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'q@q.com', password: 'Dinhquy10@' }),
  });
  const data = await res.json();
  return data.accessToken;
}

async function reserve(token, qty, label) {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}/inventory/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: [{ variantId: VARIANT_ID, quantity: qty }] }),
  });
  const elapsed = Date.now() - start;
  const body = await res.json().catch(() => ({}));
  console.log(`[${label}] status=${res.status} (${elapsed}ms) ${body.error?.code ?? 'OK'}`);
  return res.status;
}

async function main() {
  const token = await login();
  console.log('Token OK\n');

  // ─── SCENARIO A: Optimistic locking under contention ───────────────────────
  // slots=2, requests=5 → chi 2 thanh cong, 3 con lai thay available=0 → 422
  console.log('=== Scenario A: 5 concurrent x qty=1, kho chi co 2 slot ===');
  console.log('(Vui long reset DB: quantity=2, reserved=0, version=1 truoc khi chay)\n');
  const resultsA = await Promise.all(
    Array.from({ length: 5 }, (_, i) => reserve(token, 1, `A${i + 1}`))
  );
  const okA = resultsA.filter((s) => s === 201 || s === 200).length;
  const c409A = resultsA.filter((s) => s === 409).length;
  const c422A = resultsA.filter((s) => s === 422).length;
  console.log(`\n-> 201 OK: ${okA} | 409 Conflict: ${c409A} | 422 InsufficientStock: ${c422A}`);
  console.log('KY VONG: ok=2, 409=0-1 (oke neu co, chi la retry het), 422=3\n');

  // ─── SCENARIO B: 422 clear-cut ─────────────────────────────────────────────
  // Reserve het kho 1 request duy nhat, roi reserve them -> 422
  console.log('=== Scenario B: Reserve het kho roi reserve them 1 → 422 ===');
  console.log('(Vui long reset DB: quantity=50, reserved=0, version=1 truoc khi chay phan nay)\n');
  await reserve(token, 50, 'B-drainAll');   // het kho
  await reserve(token, 1,  'B-extra');      // phai 422
  console.log('KY VONG B-drainAll=201, B-extra=422\n');

  console.log('--- Reset DB sau khi test: ---');
  console.log(`UPDATE inventory SET quantity = 50, reserved = 0, version = 1`);
  console.log(`WHERE variant_id = '${VARIANT_ID}';`);
}

main().catch(console.error);