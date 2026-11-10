// LEVEL-UP member page: what you see of a member or a coach, and (on your own page) where you change it.
// profile.html?u=<user id> or profile.html?trainer=<trainer id>; without either it is your own page.
// On your own page profile.js adds the tabs of your account under the top block; this file draws the top
// block (photo, name, level) and the "My page" tab: exactly what other members see, with the buttons to
// change your photo, your text and your photos right where they show.
// A coach's page also has their calendar: the board and booking window come from schedule.js.

(() => {
  const { ACHIEVEMENTS, RANKS, esc } = LevelUp;
  const hero = document.getElementById("mpHero");
  const body = document.getElementById("mpBody");
  const book = document.getElementById("book");
  const ownBar = document.getElementById("mpOwnBar");
  const params = new URLSearchParams(location.search);
  const tr = (text) => (window.t ? window.t(text) : text); // Dutch/English for confirm()

  const who = params.get("trainer") ? { trainerId: params.get("trainer") } : params.get("u") ? { userId: params.get("u") } : null;
  let page = null;       // the page as the server gave it
  let loadedFor = null;  // who was logged in when it loaded (log in or out = load again)
  let failed = "";
  let lastSig = "";      // your own page: what it showed of you (photo, text, photos …), to load again after a change
  let loadSeq = 0;

  // Is this your own page? (no name in the address, or your own)
  function own() {
    const me = LevelUp.getPlayer();
    if (!me) return false;
    if (!who) return true;
    return who.userId ? who.userId === me.id : who.trainerId === me.trainerId;
  }
  window.LevelUpMember = { own };
  const signature = (me) => [me.id, me.xp, me.avatarUrl, me.bio, me.photos.length, me.profileVisible, me.likes, me.trainerId].join("|");
  // Your own page before the server answered (or when it doesn't): what your account already knows
  function fromPlayer(me) {
    const coach = me.trainerId ? LevelUp.trainerById(me.trainerId) : null;
    return {
      partial: true, isMe: true, linked: true, userId: me.id, trainerId: me.trainerId || null, name: coach?.name || me.name, role: coach?.role,
      avatarUrl: me.avatarUrl, xp: me.xp, since: me.createdAt, bio: me.bio, likes: me.likes, streak: me.streak?.weeks || 0,
      achievements: Object.keys(me.achievements || {}), photos: []
    };
  }
  const openAll = new Set(); // photos whose comments are all shown
  let bioEditing = false;     // your own page: is the text about yourself open for writing?
  const BIO_MAX = 1200;

  const when = (value) => new Date(value).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const day = (value) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const monthYear = (value) => new Date(value).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  function ago(value) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(value)) / 60000));
    if (mins < 1) return "now";
    if (mins < 60) return `${mins} min`;
    if (mins < 1440) return `${Math.floor(mins / 60)} h`;
    if (mins < 7 * 1440) return `${Math.floor(mins / 1440)} d`;
    return day(value);
  }
  const person = (c) => c.trainerId ? `data-profile-trainer="${esc(c.trainerId)}"` : `data-profile="${esc(c.userId)}"`;

  // ---------- Loading ----------
  async function load() {
    const player = LevelUp.getPlayer();
    const mine = own();
    const first = loadedFor === null || (player?.id || "") !== loadedFor;
    loadedFor = player?.id || "";
    failed = "";
    let target = who;
    if (mine) {
      target = player.trainerId ? { trainerId: player.trainerId } : { userId: player.id };
      lastSig = signature(player);
      if (!page?.isMe) page = fromPlayer(player);
      render(); // your own page shows at once; the photos and numbers follow
    } else if (first) {
      page = null;
    }
    if (!target || (!target.trainerId && !player)) { page = null; failed = who ? "login" : "account"; render(); return; }
    const seq = ++loadSeq;
    try {
      const fresh = await LevelUp.publicProfile(target);
      if (seq !== loadSeq) return;
      page = fresh;
    } catch (err) {
      if (seq !== loadSeq) return;
      if (mine && page) { page.partial = false; page.loadError = err.message; } else { page = null; failed = err.message; }
    }
    render();
    if (first && page && location.hash.startsWith("#photo-")) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }

  // ---------- Rendering ----------
  function render() {
    if (!LevelUp.isReady()) return;
    if (!page) {
      book.hidden = true;
      body.innerHTML = ownBar.innerHTML = "";
      hero.innerHTML = failed === "account" ? `
        <section class="no-save pixel-frame mp-gate">
          <p class="section-kicker">Not logged in</p>
          <h1 class="section-title">Player profile</h1>
          <p>Log in to see your level, XP, sessions, body stats, achievements and gear. New here? Create your profile and start at LVL 1.</p>
          <div class="btn-row"><button type="button" class="btn btn-primary" data-auth-open="signup">Create your profile</button>
            <button type="button" class="btn btn-ghost" data-auth-open="login">Log in</button></div>
        </section>` : failed === "login" ? `
        <section class="no-save pixel-frame mp-gate">
          <p class="section-kicker">Players</p>
          <h1 class="section-title">Log in to see this player</h1>
          <p>Members see each other's level, photos and group classes. Create your profile or log in.</p>
          <div class="btn-row"><button type="button" class="btn btn-primary" data-auth-open="signup">New player</button>
            <button type="button" class="btn btn-ghost" data-auth-open="login">Log in</button></div>
        </section>` : `
        <section class="no-save pixel-frame mp-gate">
          <p class="section-kicker">Players</p>
          <h1 class="section-title">Page not found</h1>
          <p>${esc(failed || "This page doesn't exist.")}</p>
          <div class="btn-row"><a class="btn btn-primary" href="index.html#highScores">To the high scores</a></div>
        </section>`;
      return;
    }
    renderHero();
    renderBody();
    renderBook();
  }

  function renderHero() {
    const d = page;
    const me = d.isMe ? LevelUp.getPlayer() : null; // your own page: always your newest level and photo
    const coach = d.trainerId ? LevelUp.trainerById(d.trainerId) : null;
    const photo = (me ? me.avatarUrl : d.avatarUrl) || (coach && !coach.dynamic ? coach.defaultImg || coach.img : null);
    const xp = me ? me.xp : d.xp;
    const prog = xp != null ? LevelUp.progress(xp) : null;
    const first = String(d.name || "").split(" ")[0];
    const likes = Number(me ? me.likes : d.likes) || 0;
    const tier = prog ? RANKS.indexOf(prog.rank) : 0;
    document.title = `${d.name} | LEVEL-UP`;
    const chips = [
      d.place ? `<span>🏆 #${d.place} on the high scores</span>` : "",
      d.streak ? `<span>🔥 ${d.streak}-week streak</span>` : "",
      d.potmWins ? `<span>👑 Player of the Month${d.potmWins > 1 ? ` ×${d.potmWins}` : ""}</span>` : "",
      me && likes ? `<span>♥ ${likes} ${likes === 1 ? "like" : "likes"}</span>` : "",
      d.since ? `<span>${d.trainerId ? "Coach" : "Player"} since ${monthYear(d.since)}</span>` : ""
    ].filter(Boolean).join("");
    hero.innerHTML = `
      <section class="mp-hero" data-tier="${tier}">
        <div class="mp-cover" aria-hidden="true"></div>
        <div class="container mp-hero-in">
          <div class="mp-avatar-wrap">
            <span class="mp-avatar ${photo ? "has-photo" : ""}">${photo ? `<img src="${esc(photo)}" alt="">` : esc(first.charAt(0).toUpperCase())}</span>
            ${me ? `<label class="avatar-edit-btn" title="${me.avatarUrl ? "Change your photo" : "Add your photo"}">
              <span aria-hidden="true">📷</span><span class="sr-only">${me.avatarUrl ? "Change your profile photo" : "Add a profile photo"}</span>
              <input type="file" accept="image/*" data-avatar-input hidden>
            </label>` : ""}
          </div>
          <div class="mp-id">
            <p class="mp-kicker">${d.trainerId ? `Coach · ${esc(d.role || "Personal trainer")}` : "Player"}</p>
            <h1 class="mp-name" data-no-i18n>${esc(d.name)}</h1>
            ${prog ? `<p class="mp-rank"><span class="rank-badge" data-tier="${tier}">${prog.rank.title}</span> <b>LVL ${prog.level}</b></p>
              <div class="xp-bar mp-xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${prog.needed}" aria-valuenow="${prog.into}" aria-label="XP to next level"><i style="width:${prog.pct.toFixed(1)}%"></i></div>
              <p class="mp-xp">${prog.into} / ${prog.needed} XP · ${prog.toNext} XP to LVL ${prog.level + 1}${me && prog.nextRank ? ` · ${prog.nextRank.title} at LVL ${prog.nextRank.level}` : ""}</p>` : ""}
            ${chips ? `<p class="mp-chips">${chips}</p>` : ""}
          </div>
          <div class="mp-actions">
            ${me ? `<button type="button" class="btn btn-ghost" data-share-card>Share my card</button>` : `
              ${d.trainerId ? `<a class="btn btn-primary" href="#book">Book ${esc(first)} ▸</a>` : ""}
              ${d.linked === false ? "" : `<button type="button" class="btn ${d.trainerId ? "btn-ghost" : "btn-primary"}" data-mp-chat>💬 Chat</button>`}
              ${d.canLike || (!LevelUp.getPlayer() && d.trainerId) ? `<button type="button" class="btn btn-ghost mp-like ${d.liked ? "liked" : ""}" data-mp-like aria-pressed="${Boolean(d.liked)}"><span aria-hidden="true">♥</span> ${d.liked ? "Liked" : "Like"}${likes ? ` · ${likes}` : ""}</button>` : ""}`}
          </div>
        </div>
      </section>
      ${d.private ? `<p class="container mp-note">🔒 ${esc(first)} keeps their page private.</p>` : ""}
      <p class="container form-error" role="alert" id="mpError"></p>`;
    if (me) bindHero();
  }

  // Your own photo and card. Bound on the elements themselves: a photo you are still picking is not lost
  // when the page draws again in the meantime.
  function bindHero() {
    const input = hero.querySelector("[data-avatar-input]");
    input?.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const label = input.closest("label");
      label.classList.add("busy");
      try {
        await LevelUp.uploadAvatar(file);
        LevelUp.toast({ title: "Photo saved", text: LevelUp.getPlayer()?.trainerId ? "It's on your coach card too." : "Your face is on the high scores now", icon: "📷", tone: "green" });
      } catch (err) {
        label.classList.remove("busy");
        LevelUp.toast({ title: "Photo not saved", text: err.message, icon: "!" });
      }
    });
    hero.querySelector("[data-share-card]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await LevelUp.shareCard(); } catch (err) { LevelUp.toast({ title: "Card not made", text: err.message, icon: "!" }); }
      button.disabled = false;
    });
  }

  function classRow(c, coachList) {
    const known = Boolean(LevelUp.classById(c.id));
    const label = c.mine ? (page.isMe ? "Signed up ✓" : "You're going too ✓") : coachList ? "Sign up →" : "Join too →";
    const inner = `<b data-no-i18n>${esc(c.title)}</b><span>${when(c.startsAt)}${coachList ? ` · ${c.taken}/${c.capacity}` : ""}</span><small class="${c.mine ? "in" : ""}">${label}</small>`;
    return known ? `<li><button type="button" data-mp-class="${esc(c.id)}">${inner}</button></li>` : `<li><a href="index.html#schedule">${inner}</a></li>`;
  }

  function activityRow(a) {
    const ach = a.kind === "achievement" ? ACHIEVEMENTS.find((x) => x.id === a.text) : null;
    if (a.kind === "achievement" && !ach) return "";
    const [icon, text] = a.kind === "class" ? ["👥", `Did <b data-no-i18n>${esc(a.text)}</b>`]
      : a.kind === "achievement" ? [ach.icon, `Unlocked <b>${esc(ach.title)}</b>`]
      : a.kind === "photo" ? ["📸", `Posted a photo${a.text ? `: <span data-no-i18n>“${esc(a.text)}”</span>` : ""}`]
      : ["👑", `Player of the Month <b>${esc(a.text)}</b>`];
    return `<li><span class="mp-act-ico" aria-hidden="true">${icon}</span><span>${text}</span><small>${day(a.date)}</small></li>`;
  }

  function photoCard(ph) {
    const player = LevelUp.getPlayer();
    const all = openAll.has(ph.id);
    const comments = all ? ph.comments : ph.comments.slice(-3);
    const hidden = ph.commentCount - comments.length;
    return `
      <article class="mp-photo" id="photo-${esc(ph.id)}" data-photo="${esc(ph.id)}">
        <button type="button" class="mp-photo-img" data-mp-zoom aria-label="Open this photo"><img src="${esc(ph.url)}" alt="${esc(ph.caption || "")}" loading="lazy"></button>
        <div class="mp-photo-body">
          ${ph.caption ? `<p class="mp-caption" data-no-i18n>${esc(ph.caption)}</p>` : ""}
          <div class="mp-photo-bar">
            <button type="button" class="mp-heart ${ph.liked ? "liked" : ""}" data-mp-photo-like aria-pressed="${Boolean(ph.liked)}" aria-label="${ph.liked ? "Unlike this photo" : "Like this photo"}"><span aria-hidden="true">♥</span> ${ph.likes || ""}</button>
            <span class="mp-count">💬 ${ph.commentCount}</span>
            <small>${day(ph.date)}</small>
            ${page.isMe ? `<button type="button" class="mp-mod" data-mp-photo-remove>Remove</button>`
              : page.canModerate ? `<button type="button" class="mp-mod" data-mp-photo-remove title="Remove this photo (admin)">Remove</button>` : ""}
          </div>
          ${hidden > 0 ? `<button type="button" class="link-btn mp-more" data-mp-all>Show all ${ph.commentCount} comments</button>` : ""}
          ${comments.length ? `<ul class="mp-comments">${comments.map((c) => `
            <li data-comment="${esc(c.id)}">
              <span class="mp-c-av" ${person(c)}>${LevelUp.avatarHtml({ name: c.name, avatarUrl: c.avatarUrl, trainerId: c.trainerId })}</span>
              <div class="mp-c-main">
                <p><b ${person(c)} data-no-i18n>${esc(c.name)}</b> <span data-no-i18n>${esc(c.body)}</span></p>
                <p class="mp-c-meta"><small>${ago(c.date)}</small>
                  <button type="button" class="mp-heart small ${c.liked ? "liked" : ""}" data-mp-comment-like aria-pressed="${Boolean(c.liked)}" aria-label="${c.liked ? "Unlike this comment" : "Like this comment"}"><span aria-hidden="true">♥</span> ${c.likes || ""}</button>
                  ${c.canDelete ? `<button type="button" class="mp-mod" data-mp-comment-remove>Remove</button>` : ""}</p>
              </div>
            </li>`).join("")}</ul>` : ""}
          ${player ? `<form class="mp-comment-form" data-mp-comment-form>
            <label class="sr-only" for="c-${esc(ph.id)}">Comment</label>
            <input id="c-${esc(ph.id)}" name="body" maxlength="300" autocomplete="off" placeholder="Write a comment…">
            <button type="submit" class="btn btn-small btn-primary">Send</button>
          </form>` : `<p class="muted small"><button type="button" class="link-btn" data-auth-open="login">Log in</button> to like and comment.</p>`}
        </div>
      </article>`;
  }

  function renderBody() {
    const d = page;
    if (d.private) { body.innerHTML = ownBar.innerHTML = ""; return; }
    const coach = d.trainerId ? LevelUp.trainerById(d.trainerId) : null;
    const first = String(d.name || "").split(" ")[0];
    const me = d.isMe ? LevelUp.getPlayer() : null;
    const cardText = d.trainerBio || coach?.bio || "";
    const about = (me ? me.bio : d.bio) || cardText || "";
    const tags = String(d.specialties || coach?.specialties || "").split(/[,·]/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
    const unlocked = ACHIEVEMENTS.filter((a) => (d.achievements || []).includes(a.id));
    const activity = (d.activity || []).map(activityRow).filter(Boolean).join("");
    const price = d.trainerId ? LevelUp.priceFor(d.trainerId) : null;
    const photos = d.photos || [];
    ownBar.innerHTML = me && d.loadError ? `<p class="form-error" role="alert">${esc(d.loadError)}</p>` : "";
    // a redraw while you are writing (new XP, a like …) must not throw away what you typed
    const draftBox = bioEditing ? document.getElementById("bioInput") : null;
    const draft = draftBox ? { text: draftBox.value, focus: document.activeElement === draftBox, at: draftBox.selectionStart } : null;
    body.innerHTML = `
      <div class="container mp-grid">
        <div class="mp-side">
          ${me || about || tags.length || d.trainerId ? `<section class="panel mp-card">
            <h2>About ${esc(first)}</h2>
            ${me ? (bioEditing ? `<form class="mypage-bio" data-mp-bio>
              <label class="sr-only" for="bioInput">About me</label>
              <textarea id="bioInput" name="bio" rows="7" maxlength="${BIO_MAX}" placeholder="e.g. Training for my first Hyrox 💪">${esc(me.bio || "")}</textarea>
              <div class="mypage-bio-row">
                <small class="muted"><span data-bio-count>${(me.bio || "").length}</span> / ${BIO_MAX}</small>
                <span class="mypage-bio-btns">
                  <button type="button" class="btn btn-small btn-ghost" data-bio-cancel>Cancel</button>
                  <button type="submit" class="btn btn-small btn-primary">Save</button>
                </span>
              </div>
              <p class="form-error" role="alert"></p>
            </form>`
              // closed: the text exactly as others read it, with a button to change it
              : `${about ? `<p class="mp-bio" data-no-i18n>${esc(about)}</p>` : `<p class="mp-bio muted">Nothing here yet. Tell others something about yourself.</p>`}
            <p class="mypage-bio-edit"><button type="button" class="btn btn-small btn-ghost" data-bio-edit>${me.bio ? "✎ Change" : "✎ Write something"}</button>
              <small class="muted">This is what others read on your page.</small></p>`)
              : about ? `<p class="mp-bio" data-no-i18n>${esc(about)}</p>` : ""}
            ${tags.length ? `<ul class="team-chips">${tags.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
            ${d.trainerId ? `<div class="trainer-stats" data-trainer-stats="${esc(d.trainerId)}"></div>
              ${price ? `<p class="mp-price"><b>${LevelUp.euro(price)}</b> per session · ${LevelUp.euro(LevelUp.getPricing().introPrice)} for your first one</p>` : ""}` : ""}
          </section>` : ""}

          ${d.xp != null ? `<section class="panel mp-card">
            <h2>In numbers</h2>
            <div class="mp-stats">
              <div><b>${d.xp.toLocaleString("en-US")}</b><span>XP</span></div>
              <div><b>${(Number(d.monthXp) || 0).toLocaleString("en-US")}</b><span>XP this month</span></div>
              <div><b>${Number(d.sessions) || 0}</b><span>Sessions</span></div>
              <div><b>${Number(d.classesDone) || 0}</b><span>Group classes</span></div>
              <div><b>${Number(d.likes) || 0}</b><span>Likes</span></div>
              <div><b>${unlocked.length}/${ACHIEVEMENTS.length}</b><span>Achievements</span></div>
            </div>
          </section>` : ""}

          ${(d.teaching || []).length ? `<section class="panel mp-card">
            <h2>Group classes with ${esc(first)}</h2>
            <ul class="mp-classes">${d.teaching.map((c) => classRow(c, true)).join("")}</ul>
          </section>` : ""}

          ${(d.upcoming || []).length ? `<section class="panel mp-card">
            <h2>Going to</h2>
            <ul class="mp-classes">${d.upcoming.map((c) => classRow(c, false)).join("")}</ul>
          </section>` : ""}

          ${unlocked.length ? `<section class="panel mp-card">
            <h2>Achievements <small class="muted">${unlocked.length}/${ACHIEVEMENTS.length}</small></h2>
            <ul class="mp-badges">${unlocked.map((a) => `<li title="${esc(a.desc)}"><span aria-hidden="true">${a.icon}</span><b>${esc(a.title)}</b></li>`).join("")}</ul>
          </section>` : ""}

          ${activity ? `<section class="panel mp-card">
            <h2>Lately</h2>
            <ul class="mp-activity">${activity}</ul>
          </section>` : ""}
        </div>

        <div class="mp-feed">
          <h2 class="mp-feed-title">Photos <small class="muted">${me ? `${d.partial ? me.photos.length : photos.length}/12` : photos.length}</small></h2>
          ${me && (d.partial ? me.photos.length : photos.length) < 12 ? `
            <label class="photo-add mp-photo-add" title="Add a photo">
              <span aria-hidden="true">＋</span><span>Add a photo</span>
              <input type="file" accept="image/*" data-photo-input hidden>
            </label>
            <p class="muted small mp-photo-rules">Post photos you'd show at the gym: a PR, a run, the squad after class. Only photos of yourself, or with the OK of who's in it. LEVEL-UP can remove a photo that doesn't fit.</p>` : ""}
          ${d.partial ? `<p class="mp-empty">Loading…</p>`
            : photos.length ? photos.map(photoCard).join("")
            : `<p class="mp-empty">${me ? "No photos yet. Add your first one above." : `${esc(first)} hasn't posted photos yet.`}</p>`}
        </div>
      </div>`;
    if (draft) {
      const box = document.getElementById("bioInput");
      if (box) {
        box.value = draft.text;
        const count = box.form.querySelector("[data-bio-count]"); if (count) count.textContent = draft.text.length;
        if (draft.focus) { box.focus(); box.setSelectionRange(draft.at, draft.at); }
      }
    }
    if (me) bindOwnPage();
    window.LevelUpSchedule?.refresh(); // fills the coach's level, sessions and open hours
  }

  // Your own page: add a photo (bound on the element itself, like the profile photo)
  function bindOwnPage() {
    const input = body.querySelector("[data-photo-input]");
    input?.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      const caption = prompt(tr("Add a short caption (optional, 140 characters):"), "");
      if (caption === null) { input.value = ""; return; }
      const tile = input.closest(".photo-add");
      tile.classList.add("busy");
      try {
        await LevelUp.addPhoto(file, caption.slice(0, 140));
        LevelUp.toast({ title: "Photo added", text: "It shows on your page now.", icon: "📸", tone: "green" });
      } catch (err) {
        tile.classList.remove("busy");
        input.value = "";
        LevelUp.toast({ title: "Photo not added", text: err.message, icon: "!" });
      }
    });
  }

  // A coach's calendar: schedule.js draws the board for this trainer and handles the booking
  let bookFor = null;
  function renderBook() {
    const id = page?.trainerId || null;
    book.hidden = !id;
    if (!id || bookFor === id) return;
    bookFor = id;
    document.getElementById("bookTitle").textContent = tr(`Book ${String(page.name).split(" ")[0]}`);
    window.LevelUpSchedule?.showTrainer(id);
    if (location.hash === "#book") book.scrollIntoView({ block: "start" });
  }

  // ---------- Actions ----------
  const setError = (text) => { const el = document.getElementById("mpError"); if (el) el.textContent = text || ""; };
  const photoOf = (el) => page.photos.find((ph) => ph.id === el.closest("[data-photo]")?.dataset.photo);
  function putPhoto(fresh) {
    page.photos = page.photos.map((ph) => (ph.id === fresh.id ? fresh : ph));
    const card = document.getElementById(`photo-${fresh.id}`);
    if (card) card.outerHTML = photoCard(fresh);
  }
  const needLogin = () => { if (LevelUp.getPlayer()) return false; LevelUp.openAuth("login"); return true; };

  document.addEventListener("click", async (event) => {
    if (!page) return;
    const t = event.target;
    if (t.closest(".mp-zoom")) { t.closest(".mp-zoom").remove(); return; }
    if (t.closest("[data-mp-chat]")) {
      if (needLogin()) return;
      if (page.trainerId) { LevelUp.openChatWith(page.trainerId); return; }
      try { location.href = `chat.html?t=${encodeURIComponent(await LevelUp.chatOpenUser(page.userId))}`; } catch (err) { setError(err.message); }
      return;
    }
    const like = t.closest("[data-mp-like]");
    if (like) {
      if (needLogin()) return;
      if (page.liked) { LevelUp.toast({ title: "Already liked this week", text: `You can like ${page.name} again on Monday.`, icon: "♥", tone: "gold" }); return; }
      like.disabled = true;
      try {
        const res = await LevelUp.likeMember(page.userId);
        page.liked = true;
        page.likes = Number(res?.likes) || (Number(page.likes) || 0) + 1;
        LevelUp.toast({ title: "Like sent", text: `${page.name} gets a heart from you ❤️`, icon: "♥", tone: "green" });
        renderHero();
        renderBody();
      } catch (err) { like.disabled = false; setError(err.message); }
      return;
    }
    const cls = t.closest("[data-mp-class]");
    if (cls) { window.LevelUpSchedule?.openClass(cls.dataset.mpClass); return; }
    const zoom = t.closest("[data-mp-zoom]");
    if (zoom) {
      const ph = photoOf(zoom);
      const box = document.createElement("div");
      box.className = "mp-zoom";
      box.innerHTML = `<img src="${esc(ph.url)}" alt="">${ph.caption ? `<p data-no-i18n>${esc(ph.caption)}</p>` : ""}<small>tap to close</small>`;
      document.body.appendChild(box);
      return;
    }
    const ph = t.closest("[data-photo]") ? photoOf(t) : null;
    if (!ph) return;
    try {
      if (t.closest("[data-mp-all]")) { openAll.add(ph.id); putPhoto(ph); return; }
      if (t.closest("[data-mp-photo-like]")) { if (needLogin()) return; putPhoto(await LevelUp.photoLike(ph.id)); return; }
      const comment = t.closest("[data-comment]");
      if (t.closest("[data-mp-comment-like]")) { if (needLogin()) return; putPhoto(await LevelUp.photoCommentLike(comment.dataset.comment)); return; }
      if (t.closest("[data-mp-comment-remove]")) {
        if (!confirm(tr("Remove this comment?"))) return;
        putPhoto(await LevelUp.photoCommentDelete(comment.dataset.comment));
        return;
      }
      if (t.closest("[data-mp-photo-remove]")) {
        if (!confirm(tr(page.isMe ? "Remove this photo from your page?" : "Remove this photo from this member's page? They are not told."))) return;
        await LevelUp.deletePhoto(ph.id);
        page.photos = page.photos.filter((x) => x.id !== ph.id);
        renderBody();
      }
    } catch (err) {
      LevelUp.toast({ title: "That didn't work", text: err.message, icon: "!" });
    }
  });

  // Your own page: the line about yourself, and who may see your page
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-mp-bio]");
    if (!form) return;
    event.preventDefault();
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    form.querySelector(".form-error").textContent = "";
    try {
      await LevelUp.setProfile({ bio: form.elements.bio.value });
      LevelUp.toast({ title: "Saved", text: "Your page is up to date.", icon: "✓", tone: "green" });
      // close the box: the page now shows the new text, the way others read it
      bioEditing = false;
      if (page?.isMe) { page.bio = LevelUp.getPlayer()?.bio || ""; renderBody(); return; }
    } catch (err) {
      form.querySelector(".form-error").textContent = err.message;
    }
    btn.disabled = false;
  });
  document.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-bio-edit]"), cancel = event.target.closest("[data-bio-cancel]");
    if (!edit && !cancel) return;
    bioEditing = Boolean(edit);
    renderBody();
    if (edit) { const box = document.getElementById("bioInput"); box?.focus(); box?.setSelectionRange(box.value.length, box.value.length); }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id !== "bioInput") return;
    const count = event.target.form?.querySelector("[data-bio-count]");
    if (count) count.textContent = event.target.value.length;
  });
  document.addEventListener("change", async (event) => {
    const box = event.target.closest("[data-page-visible]");
    if (!box) return;
    box.disabled = true;
    try {
      await LevelUp.setProfile({ visible: box.checked });
      LevelUp.toast({ title: box.checked ? "Your page is visible" : "Your page is private", text: box.checked ? "Other members can open your page." : "Others only see your name and photo.", icon: box.checked ? "👁" : "🔒", tone: "green" });
    } catch (err) {
      box.checked = !box.checked;
      LevelUp.toast({ title: "That didn't work", text: err.message, icon: "!" });
    }
    box.disabled = false;
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-mp-comment-form]");
    if (!form || !page) return;
    event.preventDefault();
    const ph = photoOf(form);
    const text = form.elements.body.value.trim();
    if (!ph || !text) return;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      openAll.add(ph.id);
      putPhoto(await LevelUp.photoComment(ph.id, text));
    } catch (err) {
      btn.disabled = false;
      LevelUp.toast({ title: "Comment not placed", text: err.message, icon: "!" });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.querySelector(".mp-zoom")?.remove();
  });

  // ---------- Start ----------
  document.addEventListener("levelup:change", () => {
    if (!LevelUp.isReady()) return;
    const me = LevelUp.getPlayer();
    if (loadedFor === null || (me?.id || "") !== loadedFor) { load(); return; } // first time, or someone logged in or out
    if (own() && signature(me) !== lastSig) load(); // you changed your photo, your text or your photos
  });
  LevelUp.ready.then(() => { if (loadedFor === null) load(); });
})();
