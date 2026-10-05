// LEVEL-UP statements and exports: monthly payout statements per trainer (printable
// PDF and CSV) and CSV downloads for the admin's finance overview.
// Used by admin.html (all trainers) and profile.html (a trainer's own statement).

window.LevelUpStatements = (() => {
  const { esc, euro } = LevelUp;
  const BILLABLE = ["completed", "no_show", "late_cancel"];
  const pad = (n) => String(n).padStart(2, "0");
  const VENUE = {
    name: "LEVEL-UP Personal Training",
    owner: "Pieter Van den Spiegel",
    address: "Hoogstraat 40, 9308 Aalst, Belgium",
    email: "PieterV-D-S@hotmail.com",
    phone: "+32 471 95 54 89"
  };

  const STATUS = { completed: "Completed", no_show: "No-show (charged)", late_cancel: "Late cancellation (charged)" };
  const TYPE = { standard: "1:1", intro: "1:1 first session", pack: "1:1 pack credit", reward: "1:1 free session (reward)", duo: "Duo" };
  const sessionType = (b) => b.kind === "duo" ? `Duo${b.partner ? ` (with ${b.partner})` : ""}` : TYPE[b.priceType] || "1:1";
  const payment = (b) => b.payMethod === "pack" ? "Pack credit" : b.payMethod === "reward" ? "Free (reward)" : b.payStatus === "paid" ? (b.payMethod === "online" ? "Paid online" : "Paid at HQ") : b.payStatus === "refunded" ? "Refunded" : "Not paid yet";

  // "2026-10" -> first/last day and a label
  function monthRange(ym) {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      from: `${y}-${pad(m)}-01`,
      to: `${y}-${pad(m)}-${pad(last)}`,
      label: new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    };
  }

  // The last `count` months, newest first, as "YYYY-MM"
  function recentMonths(count = 13) {
    const now = new Date();
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    });
  }

  // Charged sessions of one trainer in one month, with totals
  function build(trainerId, ym, bookings) {
    const range = monthRange(ym);
    const rows = bookings
      .filter((b) => b.trainerId === trainerId && BILLABLE.includes(b.status) && b.date >= range.from && b.date <= range.to)
      .sort((a, b) => (a.date + pad(a.hour)).localeCompare(b.date + pad(b.hour)));
    const total = rows.reduce((s, b) => s + b.trainerFee, 0);
    const paidOut = rows.filter((b) => b.payoutAt).reduce((s, b) => s + b.trainerFee, 0);
    return { trainer: LevelUp.trainerById(trainerId), range, rows, total, paidOut, open: total - paidOut };
  }

  // ---------- CSV (semicolon + decimal comma, opens directly in Belgian Excel) ----------
  const csvNumber = (n) => Number(n || 0).toFixed(2).replace(".", ",");
  const csvCell = (v) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function download(filename, header, rows) {
    const text = [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function statementCsv(st) {
    download(`level-up-statement-${slug(st.trainer?.short)}-${st.range.from.slice(0, 7)}.csv`,
      ["Date", "Time", "Client", "Session", "Status", "Session price", "Trainer fee", "Paid out on"],
      [
        ...st.rows.map((b) => [b.date, `${pad(b.hour)}:00`, b.name, sessionType(b), STATUS[b.status],
          csvNumber(b.price), csvNumber(b.trainerFee), b.payoutAt ? String(b.payoutAt).slice(0, 10) : ""]),
        [],
        ["Total", "", "", `${st.rows.length} sessions`, "", "", csvNumber(st.total), ""],
        ["Already paid out", "", "", "", "", "", csvNumber(st.paidOut), ""],
        ["Still to receive", "", "", "", "", "", csvNumber(st.open), ""]
      ]);
  }

  // Every session in a period with all money fields (admin export)
  function sessionsCsv(filename, bookings, ownerTrainerId) {
    download(filename,
      ["Date", "Time", "Trainer", "Client", "Client email", "Session", "Status", "Session price", "Trainer fee", "Venue share", "Payment", "Trainer paid out on"],
      bookings.map((b) => {
        const t = LevelUp.trainerById(b.trainerId);
        const fee = b.trainerId === ownerTrainerId ? 0 : b.trainerFee;
        return [b.date, `${pad(b.hour)}:00`, t?.name || b.trainerId, b.name, b.email, sessionType(b), STATUS[b.status] || b.status,
          csvNumber(b.price), csvNumber(fee), csvNumber(b.price - fee), payment(b), b.payoutAt ? String(b.payoutAt).slice(0, 10) : ""];
      }));
  }

  // The week/month overview table (admin export)
  function overviewCsv(filename, rows) {
    download(filename,
      ["Period", "From", "To", "Charged sessions", "Session revenue", "Trainer fees", "Your share", "Packs sold"],
      rows.map((r) => [r.label, r.from, r.to, r.sessions, csvNumber(r.revenue), csvNumber(r.fees), csvNumber(r.share), csvNumber(r.packs)]));
  }

  // ---------- Printable statement (the browser's "Save as PDF") ----------
  // win: a window opened right on the click (pop-up blockers allow that), for when data loads first
  function statementPdf(st, win) {
    const t = st.trainer;
    const w = win || window.open("", "_blank");
    if (!w) { alert("Allow pop-ups for this site to open the statement."); return; }
    const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const rows = st.rows.map((b) => `
      <tr>
        <td>${LevelUp.parseDate(b.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</td>
        <td>${pad(b.hour)}:00</td>
        <td>${esc(b.name)}</td>
        <td>${esc(sessionType(b))}</td>
        <td>${STATUS[b.status]}</td>
        <td class="num">${euro(b.price)}</td>
        <td class="num">${euro(b.trainerFee)}</td>
      </tr>`).join("");
    w.document.write(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LEVEL-UP statement · ${esc(t?.name || "")} · ${esc(st.range.label)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; background: #fff; }
  .sheet { max-width: 800px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 20px; border-bottom: 3px solid #1a1a1a; }
  h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: 0.02em; }
  .brand { font-weight: 800; font-size: 20px; letter-spacing: 0.08em; }
  .muted { color: #5b6b61; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
  .meta h2 { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #5b6b61; }
  .meta p { margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #dfe5e1; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #5b6b61; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin: 20px 0 0 auto; width: 320px; }
  .totals td { border: 0; padding: 4px 10px; }
  .totals .grand td { border-top: 2px solid #1a1a1a; font-weight: 800; font-size: 16px; padding-top: 10px; }
  .note { margin-top: 28px; padding: 12px 14px; background: #f3f6f4; font-size: 12.5px; }
  .actions { margin: 0 auto 24px; max-width: 800px; display: flex; gap: 10px; }
  button { font: inherit; padding: 8px 14px; border: 2px solid #1a1a1a; background: #7cff6b; cursor: pointer; font-weight: 700; }
  @media print { body { padding: 0; } .actions { display: none; } }
</style></head>
<body>
  <div class="actions"><button onclick="window.print()">Print / Save as PDF</button><button onclick="window.close()" style="background:#fff">Close</button></div>
  <div class="sheet">
    <header>
      <div>
        <p class="brand">LEVEL-UP</p>
        <h1>Monthly statement</h1>
        <p class="muted">${esc(st.range.label)}</p>
      </div>
      <div class="muted" style="text-align:right">
        ${esc(VENUE.name)}<br>${esc(VENUE.owner)}<br>${esc(VENUE.address)}<br>${esc(VENUE.email)} · ${esc(VENUE.phone)}
      </div>
    </header>
    <div class="meta">
      <div><h2>Trainer</h2><p><strong>${esc(t?.name || "")}</strong></p><p class="muted">${esc(t?.role || "Personal trainer")}</p></div>
      <div><h2>Period</h2><p>${esc(st.range.from)} to ${esc(st.range.to)}</p><p class="muted">Made on ${today}</p></div>
    </div>
    ${st.rows.length ? `
    <table>
      <thead><tr><th>Date</th><th>Time</th><th>Client</th><th>Session</th><th>Status</th><th class="num">Price</th><th class="num">Your fee</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>` : `<p class="muted">No charged sessions in this month.</p>`}
    <table class="totals">
      <tr><td>Sessions</td><td class="num">${st.rows.length}</td></tr>
      <tr class="grand"><td>Total fees</td><td class="num">${euro(st.total)}</td></tr>
      <tr><td>Already paid out</td><td class="num">${euro(st.paidOut)}</td></tr>
      <tr><td><strong>Still to receive</strong></td><td class="num"><strong>${euro(st.open)}</strong></td></tr>
    </table>
    <p class="note">Overview of the sessions you coached at LEVEL-UP in ${esc(st.range.label)}, as the basis for your invoice to
    ${esc(VENUE.owner)} (LEVEL-UP). Counted: completed sessions, no-shows and late cancellations (both charged to the client).
    Amounts are the agreed trainer fees; whether VAT applies depends on your own status as self-employed. Check with your accountant.</p>
  </div>
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 300));</script>
</body></html>`);
    w.document.close();
  }

  return { monthRange, recentMonths, build, statementCsv, statementPdf, sessionsCsv, overviewCsv, BILLABLE };
})();
