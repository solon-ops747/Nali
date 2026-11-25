(() => {
  const app = document.querySelector("#app");
  const toast = document.querySelector("#toast");
  const config = window.SAO_CONFIG || {};
  let db;
  let currentUser;
  let profile;
  let isSeller = false;
  let albums = [];
  let selectedChatUser = null;
  let chatTimer = null;
  let toastTimer = null;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const normalizeUsername = (value) => value.trim().toLowerCase();
  const emailForUsername = (username) => `${normalizeUsername(username)}@login.sao.app`;
  const showToast = (message, error = false) => {
    toast.textContent = message;
    toast.className = `toast visible${error ? " error" : ""}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = "toast"; }, 3600);
  };
  const showError = (error, fallback) => {
    console.error(error);
    showToast(error?.message || fallback, true);
  };
  const dateLabel = (value) => new Date(value).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  });

  function renderLogin(message = "") {
    clearInterval(chatTimer);
    app.innerHTML = `
      <div class="login-wrap">
        <section class="login-card card">
          <div class="brand-mark">sao<span>✿</span></div>
          <p class="eyebrow">um cantinho de arte</p>
          <h1>Que bom ter você aqui</h1>
          <p class="intro">Entre para descobrir os álbuns que foram liberados para você e deixar uma mensagem para a artista.</p>
          ${message ? `<div class="empty">${escapeHtml(message)}</div>` : ""}
          <form id="login-form">
            <div class="field"><label for="username">Seu nome de acesso</label><input id="username" name="username" autocomplete="username" required maxlength="30" placeholder="como a artista te cadastrou"></div>
            <div class="field"><label for="password">Senha</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
            <button class="button full" type="submit">Entrar no SAO <span aria-hidden="true">✦</span></button>
          </form>
          <p class="hint" style="margin:17px 0 0">O acesso é criado pela artista; não há cadastro público.</p>
        </section>
      </div>`;
    document.querySelector("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const username = normalizeUsername(form.get("username"));
      const password = form.get("password");
      const button = event.currentTarget.querySelector("button");
      button.disabled = true;
      try {
        const { error } = await db.auth.signInWithPassword({ email: emailForUsername(username), password });
        if (error) throw error;
      } catch (error) {
        showError(error, "Não foi possível entrar. Confira seu nome e sua senha.");
      } finally {
        button.disabled = false;
      }
    });
  }

  async function loadIdentity(user) {
    currentUser = user;
    const [{ data: profileData, error: profileError }, { data: sellerData, error: sellerError }] = await Promise.all([
      db.from("profiles").select("user_id, username").eq("user_id", user.id).single(),
      db.from("sellers").select("user_id").eq("user_id", user.id).maybeSingle()
    ]);
    if (profileError) throw profileError;
    if (sellerError) throw sellerError;
    profile = profileData;
    isSeller = Boolean(sellerData);
  }

  async function loadAlbums() {
    const { data, error } = await db.from("albums").select("id, name, description, created_at").order("created_at", { ascending: false });
    if (error) throw error;
    albums = data || [];
  }

  async function renderApp() {
    await loadIdentity(currentUser);
    await loadAlbums();
    selectedChatUser = isSeller ? selectedChatUser : currentUser.id;
    app.innerHTML = `
      <header class="topbar">
        <div class="brand-mark">sao<span>✿</span></div>
        <div class="topbar-actions">
          <span class="welcome">Oi, <strong>${escapeHtml(profile.username)}</strong> ✨</span>
          <button id="logout" class="button soft" type="button">Sair</button>
        </div>
      </header>
      <section class="hero card">
        <p class="eyebrow">seu espaço especial</p>
        <h1>Arte para ver com calma, conversa para ficar à vontade.</h1>
        <p>Este cantinho é privado. Você só verá os álbuns que a artista escolheu compartilhar com você.</p>
      </section>
      <div class="content-grid">
        <section class="panel card">
          <div class="panel-heading"><div><h2>Seus álbuns <span aria-hidden="true">♡</span></h2><p>Feitos e escolhidos com carinho.</p></div></div>
          <div id="album-list" class="album-list"></div>
        </section>
        <section class="panel card">
          <div class="panel-heading"><div><h2>${isSeller ? "Conversas" : "Um recadinho?"}</h2><p>${isSeller ? "Mensagens privadas com cada pessoa." : "Só você e a artista podem ler esta conversa."}</p></div></div>
          ${isSeller ? `<div class="field"><label for="chat-person">Escolha uma conversa</label><select id="chat-person"><option value="">Carregando pessoas...</option></select></div>` : ""}
          <div class="chat-box">
            <div id="chat-messages" class="chat-scroll"></div>
            <form id="chat-form" class="chat-form"><input id="chat-text" maxlength="2000" placeholder="Escreva uma mensagem..." autocomplete="off" required><button class="button" type="submit" aria-label="Enviar mensagem">Enviar</button></form>
          </div>
        </section>
      </div>
      ${isSeller ? renderSellerPanel() : ""}
      <footer class="app-footer">O SAO não registra quem abriu ou viu cada álbum. Mensagens são privadas entre você e a artista.<br>Não compartilhe sua senha; imagens podem ser copiadas por quem tem acesso.</footer>`;

    document.querySelector("#logout").addEventListener("click", async () => {
      const { error } = await db.auth.signOut();
      if (error) showError(error, "Não foi possível sair da conta.");
    });
    await renderAlbums();
    if (isSeller) await loadChatPeople();
    await loadMessages();
    document.querySelector("#chat-form").addEventListener("submit", sendMessage);
    if (isSeller) {
      document.querySelector("#chat-person").addEventListener("change", async (event) => {
        selectedChatUser = event.target.value || null;
        await loadMessages();
      });
    }
    clearInterval(chatTimer);
    chatTimer = setInterval(() => { loadMessages().catch((error) => console.error(error)); }, 8000);
    if (isSeller) bindSellerPanel();
  }

  function renderSellerPanel() {
    return `
      <details class="panel card admin-panel">
        <summary>Painel da artista <span aria-hidden="true">✿</span></summary>
        <div class="admin-content admin-grid">
          <section class="admin-box">
            <h3>Criar acesso</h3>
            <p>Crie um nome e uma senha e escolha os álbuns que essa pessoa poderá ver.</p>
            <form id="create-user-form">
              <div class="field"><label for="new-username">Nome de acesso</label><input id="new-username" name="username" minlength="3" maxlength="30" pattern="[a-zA-Z0-9._-]+" required placeholder="ex.: lua.arte"></div>
              <div class="field"><label for="new-password">Senha inicial</label><input id="new-password" name="password" type="password" minlength="8" required placeholder="pelo menos 8 caracteres"></div>
              <p class="hint">A senha não é mostrada novamente. Combine a entrega com a pessoa por um canal privado.</p>
              <button class="button full" type="submit">Criar acesso</button>
            </form>
          </section>
          <section class="admin-box">
            <h3>Novo álbum</h3>
            <p>Depois de criar, libere o álbum para cada pessoa na lista abaixo.</p>
            <form id="create-album-form">
              <div class="field"><label for="album-name">Nome do álbum</label><input id="album-name" name="name" maxlength="80" required placeholder="Flores, veículos..."></div>
              <div class="field"><label for="album-description">Descrição (opcional)</label><textarea id="album-description" name="description" maxlength="300" placeholder="Um pouquinho sobre este álbum"></textarea></div>
              <button class="button full" type="submit">Criar álbum</button>
            </form>
          </section>
          <section class="admin-box">
            <h3>Adicionar imagens</h3>
            <p>As imagens ficam em armazenamento privado; só pessoas autorizadas conseguem abrir.</p>
            <form id="upload-form">
              <div class="field"><label for="upload-album">Álbum</label><select id="upload-album" name="album" required></select></div>
              <div class="field"><label for="photo-files">Imagens (até 8 MB cada)</label><input id="photo-files" type="file" accept="image/*" multiple required></div>
              <button class="button full" type="submit">Enviar imagens</button>
            </form>
          </section>
          <section class="admin-box">
            <h3>Vincular link de álbum/vídeo</h3>
            <p>Ideal para vídeos: cole um link compartilhável (YouTube, Google Fotos/Drive, Vimeo etc.) para aparecer no álbum.</p>
            <form id="link-form">
              <div class="field"><label for="link-album">Álbum</label><select id="link-album" name="album" required></select></div>
              <div class="field"><label for="link-url">Link</label><input id="link-url" name="url" type="url" inputmode="url" maxlength="2000" required placeholder="https://..."></div>
              <div class="field"><label for="link-caption">Nome (opcional)</label><input id="link-caption" name="caption" maxlength="120" placeholder="Ex.: Álbum de vídeos"></div>
              <button class="button full" type="submit">Vincular link</button>
            </form>
          </section>
          <section class="admin-box">
            <h3>Acessos e álbuns</h3>
            <p>Marque os álbuns permitidos para cada pessoa e salve as alterações.</p>
            <div id="permissions-list" class="admin-list"><div class="empty">Carregando acessos...</div></div>
          </section>
        </div>
      </details>`;
  }

  async function renderAlbums() {
    const container = document.querySelector("#album-list");
    const uploadSelect = document.querySelector("#upload-album");
    const linkSelect = document.querySelector("#link-album");
    for (const select of [uploadSelect, linkSelect]) {
      if (!select) continue;
      select.innerHTML = albums.map((album) => `<option value="${escapeHtml(album.id)}">${escapeHtml(album.name)}</option>`).join("");
      if (!albums.length) select.innerHTML = `<option value="">Crie um álbum primeiro</option>`;
    }
    if (!albums.length) {
      container.innerHTML = `<div class="empty"><span class="empty-icon">☁</span>${isSeller ? "Seu primeiro álbum pode nascer ali no Painel da artista." : "Ainda não há álbuns liberados para você. Quando a artista compartilhar um, ele aparecerá aqui."}</div>`;
      return;
    }
    container.innerHTML = albums.map((album) => `
      <article class="album-card" data-album="${escapeHtml(album.id)}">
        <div class="album-head">
          <div><h3>${escapeHtml(album.name)}</h3><p>${escapeHtml(album.description || "Um álbum especial, feito com carinho.")}</p></div>
          ${isSeller ? `
          <div class="album-add">
            <button type="button" class="text-button add-toggle" aria-expanded="false">＋ Adicionar</button>
            <div class="add-menu hidden" role="menu">
              <label class="button soft" role="menuitem"><input class="inline-upload hidden" type="file" accept="image/*" multiple>Imagens</label>
              <button type="button" class="button soft show-link-form" role="menuitem">Link de álbum/vídeo</button>
            </div>
          </div>` : ""}
        </div>
        ${isSeller ? `
        <form class="add-link-form hidden" autocomplete="off">
          <div class="field"><label>Link do álbum ou vídeo</label><input name="url" type="url" inputmode="url" maxlength="2000" required placeholder="https://..."></div>
          <div class="field"><label>Nome (opcional)</label><input name="caption" maxlength="120" placeholder="Ex.: Álbum de vídeos no YouTube"></div>
          <div class="add-link-actions"><button class="button" type="submit">Vincular</button><button class="button soft cancel-link" type="button">Cancelar</button></div>
          <p class="hint">Use um link compartilhável (YouTube, Google Fotos/Drive, Vimeo etc.). O conteúdo segue as regras do serviço do link.</p>
        </form>` : ""}
        <div class="photo-grid"><div class="empty">Abrindo o álbum...</div></div>
      </article>`).join("");
    for (const album of albums) {
      const card = container.querySelector(`[data-album="${album.id}"]`);
      await renderPhotos(album, card.querySelector(".photo-grid"));
      if (!isSeller) continue;
      const toggle = card.querySelector(".add-toggle");
      const menu = card.querySelector(".add-menu");
      const linkForm = card.querySelector(".add-link-form");
      toggle.addEventListener("click", () => {
        const open = !menu.classList.contains("hidden");
        menu.classList.toggle("hidden", open);
        toggle.setAttribute("aria-expanded", String(!open));
        if (!open) linkForm.classList.add("hidden");
      });
      card.querySelector(".inline-upload").addEventListener("change", (event) => uploadFiles(album.id, event.target.files, event.target));
      card.querySelector(".show-link-form").addEventListener("click", () => {
        menu.classList.add("hidden");
        toggle.setAttribute("aria-expanded", "false");
        linkForm.classList.remove("hidden");
        linkForm.querySelector('input[name="url"]').focus();
      });
      card.querySelector(".cancel-link").addEventListener("click", () => {
        linkForm.reset();
        linkForm.classList.add("hidden");
      });
      linkForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        await addExternalLink(album.id, new FormData(linkForm), linkForm);
      });
    }
  }

  async function renderPhotos(album, container) {
    const { data: items, error } = await db.from("album_photos").select("id, object_name, caption, external_url").eq("album_id", album.id).order("created_at");
    if (error) throw error;
    if (!items?.length) {
      container.innerHTML = `<div class="empty">${isSeller ? "Use ＋ Adicionar para enviar imagens ou vincular um link de álbum/vídeo." : "Este álbum ainda está sendo preparado."}</div>`;
      return;
    }
    container.innerHTML = (await Promise.all(items.map(async (item) => {
      const label = item.caption || album.name;
      if (item.external_url) {
        let host = "";
        try { host = new URL(item.external_url).hostname.replace(/^www\./, ""); } catch { host = "link externo"; }
        return `<a class="photo link-item" href="${escapeHtml(item.external_url)}" target="_blank" rel="noopener noreferrer"><span class="link-thumb" aria-hidden="true">▶</span><span class="link-caption"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(host)}</small></span></a>`;
      }
      const { data, error: signedError } = await db.storage.from("album-images").createSignedUrl(item.object_name, 3600);
      if (signedError) throw signedError;
      return `<figure class="photo"><img src="${escapeHtml(data.signedUrl)}" alt="${escapeHtml(label)}" loading="lazy"><figcaption>${escapeHtml(label)}</figcaption></figure>`;
    }))).join("");
  }

  async function loadSellerPeople() {
    const { data, error } = await db.from("profiles").select("user_id, username").order("username");
    if (error) throw error;
    return (data || []).filter((person) => person.user_id !== currentUser.id);
  }

  async function loadChatPeople() {
    const select = document.querySelector("#chat-person");
    const people = await loadSellerPeople();
    select.innerHTML = people.length
      ? `<option value="">Escolha uma pessoa</option>${people.map((person) => `<option value="${escapeHtml(person.user_id)}">${escapeHtml(person.username)}</option>`).join("")}`
      : `<option value="">Nenhuma pessoa cadastrada ainda</option>`;
    if (selectedChatUser && people.some((person) => person.user_id === selectedChatUser)) select.value = selectedChatUser;
    else selectedChatUser = null;
    document.querySelector("#chat-form button").disabled = !selectedChatUser;
  }

  async function loadMessages() {
    const container = document.querySelector("#chat-messages");
    if (!container) return;
    if (!selectedChatUser) {
      container.innerHTML = `<div class="empty">${isSeller ? "Selecione uma pessoa para abrir a conversa privada." : "Sua conversa com a artista aparecerá aqui."}</div>`;
      return;
    }
    const { data, error } = await db.from("messages").select("id, user_id, sender_id, body, created_at").eq("user_id", selectedChatUser).order("created_at", { ascending: true }).limit(200);
    if (error) throw error;
    let names = new Map();
    if (isSeller && data?.length) {
      const { data: people, error: peopleError } = await db.from("profiles").select("user_id, username").in("user_id", [...new Set(data.map((item) => item.sender_id))]);
      if (peopleError) throw peopleError;
      names = new Map((people || []).map((person) => [person.user_id, person.username]));
    }
    container.innerHTML = data?.length ? data.map((item) => {
      const mine = item.sender_id === currentUser.id;
      const sender = mine ? (isSeller ? "Você" : "Você") : (isSeller ? names.get(item.sender_id) || "Pessoa" : "Artista");
      return `<article class="bubble${mine ? " mine" : ""}"><strong>${escapeHtml(sender)}</strong><p>${escapeHtml(item.body)}</p><time>${escapeHtml(dateLabel(item.created_at))}</time></article>`;
    }).join("") : `<div class="empty">A conversa começa com um oi. ♡</div>`;
    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = document.querySelector("#chat-text");
    const body = input.value.trim();
    if (!body || !selectedChatUser) return;
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      const { error } = await db.from("messages").insert({
        user_id: selectedChatUser, sender_id: currentUser.id, body
      });
      if (error) throw error;
      input.value = "";
      await loadMessages();
    } catch (error) {
      showError(error, "Não foi possível enviar a mensagem.");
    } finally {
      button.disabled = !selectedChatUser;
    }
  }

  function bindSellerPanel() {
    document.querySelector("#create-user-form").addEventListener("submit", createUser);
    document.querySelector("#create-album-form").addEventListener("submit", createAlbum);
    document.querySelector("#upload-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const albumId = new FormData(event.currentTarget).get("album");
      const files = document.querySelector("#photo-files").files;
      await uploadFiles(albumId, files, event.currentTarget.querySelector("button"));
      event.currentTarget.reset();
    });
    document.querySelector("#link-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await addExternalLink(new FormData(event.currentTarget).get("album"), new FormData(event.currentTarget), event.currentTarget);
    });
    loadPermissions().catch((error) => showError(error, "Não foi possível carregar os acessos."));
  }

  async function createUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = normalizeUsername(fields.get("username"));
    const password = fields.get("password");
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      showToast("Use de 3 a 30 caracteres: letras sem acento, números, ponto, hífen ou sublinhado.", true);
      return;
    }
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const { data, error } = await db.functions.invoke("create-user", { body: { username, password } });
      if (error) {
        let message = error.message;
        if (error.context?.json) {
          try {
            const response = await error.context.json();
            if (response.error) message = response.error;
          } catch (parseError) {
            console.error(parseError);
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      form.reset();
      showToast(`Acesso de ${username} criado. Anote a senha e envie em privado.`);
      await loadPermissions();
      await loadChatPeople();
    } catch (error) {
      showError(error, "Não foi possível criar o acesso. Confira a configuração da função.");
    } finally {
      button.disabled = false;
    }
  }

  async function createAlbum(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const { error } = await db.from("albums").insert({
        name: values.get("name").trim(),
        description: values.get("description").trim() || null,
        created_by: currentUser.id
      });
      if (error) throw error;
      form.reset();
      await loadAlbums();
      await renderAlbums();
      await loadPermissions();
      showToast("Álbum criado. Agora escolha quem pode vê-lo.");
    } catch (error) {
      showError(error, "Não foi possível criar o álbum.");
    } finally {
      button.disabled = false;
    }
  }

  async function uploadFiles(albumId, files, button) {
    const selected = [...(files || [])];
    if (!albumId || !selected.length) return;
    if (selected.some((file) => !file.type.startsWith("image/") || file.size > 8 * 1024 * 1024)) {
      showToast("Escolha apenas imagens de até 8 MB cada.", true);
      if (button?.type === "submit") button.disabled = false;
      return;
    }
    if (button) button.disabled = true;
    try {
      for (const file of selected) {
        const extension = file.name.split(".").pop().replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
        const objectName = `${albumId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await db.storage.from("album-images").upload(objectName, file, {
          cacheControl: "3600", contentType: file.type, upsert: false
        });
        if (uploadError) throw uploadError;
        const { error: rowError } = await db.from("album_photos").insert({
          album_id: albumId, object_name: objectName, external_url: null, caption: file.name.replace(/\.[^.]+$/, "")
        });
        if (rowError) throw rowError;
      }
      showToast(`${selected.length} imagem(ns) adicionada(s).`);
      await renderAlbums();
    } catch (error) {
      showError(error, "Não foi possível enviar as imagens.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function addExternalLink(albumId, values, formOrButton) {
    if (!albumId) {
      showToast("Escolha um álbum para vincular o link.", true);
      return;
    }
    const rawUrl = (values.get("url") || "").toString().trim();
    const caption = (values.get("caption") || "").toString().trim();
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      showToast("Digite um link válido começando com https://", true);
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      showToast("Use um link que comece com http:// ou https://", true);
      return;
    }
    const button = formOrButton?.querySelector ? formOrButton.querySelector('button[type="submit"]') : formOrButton;
    if (button) button.disabled = true;
    try {
      const { error } = await db.from("album_photos").insert({
        album_id: albumId,
        external_url: parsed.toString(),
        object_name: null,
        caption: caption || null
      });
      if (error) throw error;
      if (formOrButton?.reset) {
        formOrButton.reset();
        if (formOrButton.classList?.contains("add-link-form")) formOrButton.classList.add("hidden");
      }
      showToast("Link vinculado ao álbum.");
      await renderAlbums();
    } catch (error) {
      showError(error, "Não foi possível vincular o link.");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadPermissions() {
    const container = document.querySelector("#permissions-list");
    if (!container) return;
    const people = await loadSellerPeople();
    if (!people.length) {
      container.innerHTML = `<div class="empty">Crie um acesso para começar.</div>`;
      return;
    }
    const { data: grants, error } = await db.from("album_access").select("user_id, album_id");
    if (error) throw error;
    const byUser = new Map();
    for (const grant of grants || []) {
      if (!byUser.has(grant.user_id)) byUser.set(grant.user_id, new Set());
      byUser.get(grant.user_id).add(grant.album_id);
    }
    container.innerHTML = people.map((person) => `
      <div class="admin-user" data-person="${escapeHtml(person.user_id)}">
        <strong title="${escapeHtml(person.username)}">${escapeHtml(person.username)}</strong>
        ${albums.map((album) => `<label class="check-label" title="${escapeHtml(album.name)}"><input type="checkbox" value="${escapeHtml(album.id)}" ${byUser.get(person.user_id)?.has(album.id) ? "checked" : ""}>${escapeHtml(album.name)}</label>`).join("")}
        <button class="button soft save-permissions" type="button">Salvar</button>
      </div>`).join("");
    container.querySelectorAll(".save-permissions").forEach((button) => {
      button.addEventListener("click", () => savePermissions(button.closest("[data-person]")));
    });
  }

  async function savePermissions(row) {
    const userId = row.dataset.person;
    const checked = [...row.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    const button = row.querySelector("button");
    button.disabled = true;
    try {
      const { error } = await db.rpc("set_album_access", {
        p_user_id: userId,
        p_album_ids: checked
      });
      if (error) throw error;
      showToast("Permissões atualizadas.");
    } catch (error) {
      showError(error, "Não foi possível atualizar as permissões.");
      await loadPermissions();
    } finally {
      button.disabled = false;
    }
  }

  function start() {
    const configured = config.supabaseUrl && config.supabaseAnonKey
      && !config.supabaseUrl.includes("COLE_") && !config.supabaseAnonKey.includes("COLE_");
    if (!configured || !window.supabase?.createClient) {
      renderLogin("Para publicar o site, primeiro configure a URL e a chave pública do Supabase em config.js. O passo a passo está no README.");
      return;
    }
    db = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    renderLogin();
    db.auth.onAuthStateChange((event, session) => {
      if (!["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "USER_DELETED"].includes(event)) return;
      setTimeout(() => {
        if (!session) {
          currentUser = null;
          renderLogin();
          return;
        }
        currentUser = session.user;
        renderApp().catch((error) => {
          showError(error, "Não foi possível carregar sua conta.");
          db.auth.signOut();
        });
      }, 0);
    });
  }

  start();
})();
