// LEVEL-UP: posts. A post is one to six photos with a text, on a member's page. Other members give it a heart and
// write comments under it (a comment can get a heart too). The same post shows on the member's page (member.js) and
// on the start screen "For you" under "From the club" (foryou.js); this file draws it and handles what you tap,
// and holds the window to make a new post.

(() => {
  const { esc } = LevelUp;
  const tr = (s) => (window.t ? window.t(s) : s);
  // The text of a post card is translated here (not by the page translator), so it also works inside the start
  // screen, which the page translator leaves alone. {0}, {1} are filled in after translating.
  const T = (s, ...args) => { let out = tr(s); args.forEach((v, i) => { out = out.split(`{${i}}`).join(v); }); return out; };
  const MAX_PHOTOS = 6;
  const MAX_TEXT = 500;
  const openAll = new Set(); // posts whose comments are all shown

  const day = (v) => new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  function ago(v) {
    const min = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000));
    if (min < 1) return T("now");
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${Math.floor(min / 60)} h`;
    if (min < 7 * 1440) return `${Math.floor(min / 1440)} d`;
    return day(v);
  }
  const person = (c) => (c.trainerId ? `data-profile-trainer="${esc(c.trainerId)}"` : c.userId ? `data-profile="${esc(c.userId)}"` : "");
  const photosOf = (post) => (post.urls && post.urls.length ? post.urls : post.url ? [post.url] : []);

  // One post. owner: show who posted it (the start screen); remove: "mine" | "admin" | "" (who may remove it here);
  // anchor: give it the id a link points to (#photo-…; only on the member's page, a page can show a post twice);
  // size: "l" | "s" | "" for the grid on the start screen of a computer
  function cardHtml(post, { owner = false, remove = "", anchor = false, size = "" } = {}) {
    const player = LevelUp.getPlayer();
    const urls = photosOf(post);
    const comments = post.comments || [];
    const shown = openAll.has(post.id) ? comments : comments.slice(-3);
    const hidden = (Number(post.commentCount) || comments.length) - shown.length;
    const who = post.ownerTrainerId ? `data-profile-trainer="${esc(post.ownerTrainerId)}"` : post.userId ? `data-profile="${esc(post.userId)}"` : "";
    return `
      <article class="post${size ? ` post-${size}` : ""}" ${anchor ? `id="photo-${esc(post.id)}"` : ""} data-post="${esc(post.id)}" data-no-i18n>
        ${owner ? `
          <header class="post-head" ${who}>
            ${LevelUp.avatarHtml({ name: post.name, avatarUrl: post.avatarUrl, trainerId: post.ownerTrainerId })}
            <div><b data-no-i18n>${esc(post.name || "")}</b><small>${ago(post.date)}</small></div>
          </header>` : ""}
        <div class="post-media" data-n="${urls.length}">
          <div class="post-track" data-post-track>${urls.map((u, i) => `
            <button type="button" class="post-photo" data-post-zoom="${i}" aria-label="${esc(T("Open this photo"))}"><img src="${esc(u)}" alt="" loading="lazy" decoding="async"></button>`).join("")}</div>
          ${urls.length > 1 ? `<span class="post-count" data-post-count aria-hidden="true">1 / ${urls.length}</span>
            <span class="post-dots" aria-hidden="true">${urls.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</span>` : ""}
        </div>
        <div class="post-body">
          ${post.caption ? `<p class="post-text" data-no-i18n>${esc(post.caption)}</p>` : ""}
          <div class="post-bar">
            <button type="button" class="mp-heart ${post.liked ? "liked" : ""}" data-post-like aria-pressed="${Boolean(post.liked)}" aria-label="${esc(T(post.liked ? "Unlike this post" : "Like this post"))}"><span aria-hidden="true">♥</span> ${post.likes || ""}</button>
            <span class="mp-count">💬 ${Number(post.commentCount) || 0}</span>
            ${owner ? "" : `<small>${day(post.date)}</small>`}
            ${remove ? `<button type="button" class="mp-mod" data-post-remove ${remove === "admin" ? `title="${esc(T("Remove this post (admin)"))}"` : ""}>${T("Remove")}</button>` : ""}
          </div>
          ${hidden > 0 ? `<button type="button" class="link-btn mp-more" data-post-all>${T("Show all {0} comments", Number(post.commentCount) || comments.length)}</button>` : ""}
          ${shown.length ? `<ul class="mp-comments">${shown.map((c) => `
            <li data-comment="${esc(c.id)}">
              <span class="mp-c-av" ${person(c)}>${LevelUp.avatarHtml({ name: c.name, avatarUrl: c.avatarUrl, trainerId: c.trainerId })}</span>
              <div class="mp-c-main">
                <p><b ${person(c)} data-no-i18n>${esc(c.name)}</b> <span data-no-i18n>${esc(c.body)}</span></p>
                <p class="mp-c-meta"><small>${ago(c.date)}</small>
                  <button type="button" class="mp-heart small ${c.liked ? "liked" : ""}" data-post-comment-like aria-pressed="${Boolean(c.liked)}" aria-label="${esc(T(c.liked ? "Unlike this comment" : "Like this comment"))}"><span aria-hidden="true">♥</span> ${c.likes || ""}</button>
                  ${c.canDelete ? `<button type="button" class="mp-mod" data-post-comment-remove>${T("Remove")}</button>` : ""}</p>
              </div>
            </li>`).join("")}</ul>` : ""}
          ${player ? `<form class="mp-comment-form" data-post-comment-form>
            <label class="sr-only" for="c-${esc(post.id)}">${T("Comment")}</label>
            <input id="c-${esc(post.id)}" name="body" maxlength="300" autocomplete="off" placeholder="${esc(T("Write a comment…"))}">
            <button type="submit" class="btn btn-small btn-primary">${T("Send")}</button>
          </form>` : `<p class="muted small"><button type="button" class="link-btn" data-auth-open="login">${T("Log in")}</button> ${T("to like and comment.")}</p>`}
        </div>
      </article>`;
  }

  // The counter and the dots follow the photo you swiped to
  document.addEventListener("scroll", (event) => {
    const track = event.target;
    if (!track?.matches?.("[data-post-track]")) return;
    const media = track.parentElement;
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    const count = media.querySelector("[data-post-count]");
    if (count) count.textContent = `${i + 1} / ${track.children.length}`;
    media.querySelectorAll(".post-dots i").forEach((dot, k) => dot.classList.toggle("on", k === i));
  }, true);

  // A photo full screen; tap to close
  document.addEventListener("click", (event) => {
    const zoomed = event.target.closest(".mp-zoom");
    if (zoomed) zoomed.remove();
  });

  const needLogin = () => { if (LevelUp.getPlayer()) return false; LevelUp.openAuth("login"); return true; };

  // What was tapped in a post? Returns true when it was something of a post (handled here).
  // store: { find(id) -> post, put(fresh post from the server), removed(id), askRemove(post) -> text of the question }
  async function handleClick(event, store) {
    const t = event.target;
    const card = t.closest("[data-post]");
    if (!card) return false;
    const post = store.find(card.dataset.post);
    if (!post) return false;
    const zoom = t.closest("[data-post-zoom]");
    if (zoom) {
      const box = document.createElement("div");
      box.className = "mp-zoom";
      box.innerHTML = `<img src="${esc(photosOf(post)[Number(zoom.dataset.postZoom)] || post.url)}" alt="">${post.caption ? `<p data-no-i18n>${esc(post.caption)}</p>` : ""}<small data-no-i18n>${T("tap to close")}</small>`;
      document.body.appendChild(box);
      event.stopPropagation();
      return true;
    }
    try {
      if (t.closest("[data-post-all]")) { openAll.add(post.id); store.put(post); return true; }
      if (t.closest("[data-post-like]")) { if (!needLogin()) store.put(await LevelUp.photoLike(post.id)); return true; }
      const comment = t.closest("[data-comment]");
      if (t.closest("[data-post-comment-like]")) { if (!needLogin()) store.put(await LevelUp.photoCommentLike(comment.dataset.comment)); return true; }
      if (t.closest("[data-post-comment-remove]")) {
        if (confirm(tr("Remove this comment?"))) store.put(await LevelUp.photoCommentDelete(comment.dataset.comment));
        return true;
      }
      if (t.closest("[data-post-remove]")) {
        if (!confirm(tr(store.askRemove ? store.askRemove(post) : "Remove this post from your page?"))) return true;
        await LevelUp.deletePhoto(post.id);
        store.removed(post.id);
        return true;
      }
    } catch (err) {
      LevelUp.toast({ title: "That didn't work", text: err.message, icon: "!" });
      return true;
    }
    return false;
  }
  // A comment is sent. Returns true when the form was a post's.
  async function handleSubmit(event, store) {
    const form = event.target.closest?.("[data-post-comment-form]");
    if (!form) return false;
    event.preventDefault();
    const post = store.find(form.closest("[data-post]")?.dataset.post);
    const input = form.elements.body;
    const text = input.value.trim();
    if (!post || !text) return true;
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      const fresh = await LevelUp.photoComment(post.id, text);
      openAll.add(post.id); // you just wrote one: show the whole conversation
      input.value = "";
      store.put(fresh);
    } catch (err) {
      btn.disabled = false;
      LevelUp.toast({ title: "Comment not sent", text: err.message, icon: "!" });
    }
    return true;
  }

  // ---------- A new post: pick up to six photos and write something about them ----------
  let dialog = null;
  let picked = []; // { file, url (preview) }
  function compose() {
    if (!LevelUp.getPlayer()) { LevelUp.openAuth("login"); return; }
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "auth-dialog post-dialog";
      dialog.setAttribute("aria-labelledby", "postTitle");
      document.body.appendChild(dialog);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog || event.target.closest("[data-close]")) { dialog.close(); return; }
        const drop = event.target.closest("[data-post-drop]");
        if (drop) {
          const gone = picked.splice(Number(drop.dataset.postDrop), 1)[0];
          if (gone) URL.revokeObjectURL(gone.url);
          drawPicked();
        }
      });
      dialog.addEventListener("close", () => { picked.forEach((x) => URL.revokeObjectURL(x.url)); picked = []; });
    }
    picked = [];
    dialog.innerHTML = `
      <button type="button" class="dialog-close" data-close aria-label="Close">✕</button>
      <p class="section-kicker">Your page</p>
      <h2 class="auth-title" id="postTitle">New post</h2>
      <form class="auth-form" id="postForm">
        <div class="post-picks" id="postPicks"></div>
        <label>What is it about?
          <textarea name="text" rows="4" maxlength="${MAX_TEXT}" placeholder="A PR, a run, the squad after class…"></textarea>
        </label>
        <p class="post-left"><span data-post-left>0</span> / ${MAX_TEXT}</p>
        <p class="muted small">It shows on your page and, for the other members, on their start screen. Only photos of yourself, or with the OK of who's in it. LEVEL-UP can remove a post that doesn't fit.</p>
        <p class="form-error" role="alert"></p>
        <button type="submit" class="btn btn-primary btn-block" id="postSubmit" disabled>Post ▶</button>
      </form>`;
    const form = dialog.querySelector("#postForm");
    form.elements.text.addEventListener("input", () => { dialog.querySelector("[data-post-left]").textContent = form.elements.text.value.length; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = dialog.querySelector("#postSubmit");
      const error = form.querySelector(".form-error");
      if (!picked.length) return;
      submit.disabled = true;
      error.textContent = "";
      try {
        await LevelUp.addPost(picked.map((x) => x.file), form.elements.text.value, (done, all) => { submit.textContent = `${tr("Uploading…")} ${done}/${all}`; });
        dialog.close();
        LevelUp.toast({ title: "Posted", text: "It's on your page now.", icon: "📸", tone: "green" });
        document.dispatchEvent(new CustomEvent("levelup:posted"));
      } catch (err) {
        error.textContent = err.message;
        submit.disabled = false;
        submit.textContent = tr("Post ▶");
      }
    });
    drawPicked();
    if (!dialog.open) dialog.showModal();
  }
  function drawPicked() {
    const box = dialog.querySelector("#postPicks");
    box.innerHTML = `${picked.map((x, i) => `
      <figure class="post-pick"><img src="${esc(x.url)}" alt=""><button type="button" data-post-drop="${i}" aria-label="Remove this photo">✕</button></figure>`).join("")}
      ${picked.length < MAX_PHOTOS ? `
        <label class="post-pick post-pick-add">
          <span aria-hidden="true">＋</span><span>${picked.length ? "Add more" : "Add photos"}</span>
          <input type="file" accept="image/*" multiple hidden data-post-files>
        </label>` : ""}
      <p class="post-pick-note muted small">${picked.length ? `${picked.length} / ${MAX_PHOTOS}` : `Up to ${MAX_PHOTOS} photos in one post`}</p>`;
    box.querySelector("[data-post-files]")?.addEventListener("change", (event) => {
      const files = [...(event.target.files || [])].filter((f) => /^image\//.test(f.type));
      const room = MAX_PHOTOS - picked.length;
      files.slice(0, room).forEach((file) => picked.push({ file, url: URL.createObjectURL(file) }));
      dialog.querySelector(".form-error").textContent = files.length > room ? tr(`A post takes up to ${MAX_PHOTOS} photos.`) : "";
      drawPicked();
    });
    dialog.querySelector("#postSubmit").disabled = !picked.length;
  }

  window.LevelUpPosts = { cardHtml, handleClick, handleSubmit, compose, MAX_PHOTOS, MAX_TEXT };
})();
