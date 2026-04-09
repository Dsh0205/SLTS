import {
  TEXT,
  createAlbumName,
  createId,
  formatDateTime,
  getActiveAlbum,
  getActiveAnchor,
  getAlbumById,
  getPhotoById,
  getPhotoCount,
  isTypingTarget,
  loadState,
  sanitizePhotoName,
  saveState,
} from "./gallery-state.js";
import { serializePhotoFile } from "./gallery-media.js";
import {
  collectPhotoFilePaths,
  photoNeedsExternalization,
  resolvePhotoSource,
} from "./photo-storage.js";

export function initGalleryPage() {
  const desktopBridge = window.shanlicDesktop || null;
  const params = new URLSearchParams(window.location.search);
  const anchorIdFromQuery = params.get("anchor");
  const dom = getDom();

  let state = loadState();
  let toastTimer = 0;
  let viewMode = "shelf";
  let selectedPhotoId = null;
  let lightboxPhotoId = null;
  let storageInfo = null;
  let storageBusy = false;
  let migrationBusy = false;
  let animateAlbumEntry = false;
  let animateShelfEntry = true;

  if (anchorIdFromQuery && state.anchors.some((anchor) => anchor.id === anchorIdFromQuery) && state.activeAnchorId !== anchorIdFromQuery) {
    state.activeAnchorId = anchorIdFromQuery;
    saveState(state);
  }

  if (!getActiveAnchor(state)) {
    showToast(TEXT.noAnchor);
    window.setTimeout(() => {
      window.location.href = "./index.html";
    }, 700);
    return;
  }

  bindEvents();
  render();
  void initializeStorageLayer();

  async function initializeStorageLayer() {
    await refreshStorageInfo();
    await migrateEmbeddedPhotosIfNeeded();
  }

  function bindEvents() {
    dom.panelToggleBtn.addEventListener("click", () => {
      setPanelMenuOpen(dom.panelMenu.hidden);
    });

    dom.backToMapBtn.addEventListener("click", () => {
      window.location.href = "./index.html";
    });

    dom.albumBackBtn.addEventListener("click", () => {
      viewMode = "shelf";
      selectedPhotoId = null;
      animateShelfEntry = true;
      closeLightbox();
      render();
    });

    dom.anchorNameInput.addEventListener("change", handleAnchorRename);
    dom.anchorNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        dom.anchorNameInput.blur();
      }
    });

    dom.changeStorageDirBtn?.addEventListener("click", handleChangeStorageDirectory);
    dom.resetStorageDirBtn?.addEventListener("click", handleResetStorageDirectory);
    dom.createAlbumBtn.addEventListener("click", handleCreateAlbum);
    dom.addPhotosBtn.addEventListener("click", () => {
      if (!getActiveAlbum(state)) {
        showToast(TEXT.needAlbum);
        return;
      }
      dom.photoInput.click();
    });
    dom.deleteAlbumBtn.addEventListener("click", handleDeleteAlbum);
    dom.deleteAnchorBtn.addEventListener("click", handleDeleteAnchor);
    dom.photoInput.addEventListener("change", handlePhotoSelection);
    dom.lightboxCloseBtn.addEventListener("click", closeLightbox);
    dom.lightbox.addEventListener("click", (event) => {
      if (event.target === dom.lightbox) {
        closeLightbox();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (dom.panelMenu.hidden) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node) || (!dom.panelMenu.contains(target) && !dom.panelToggleBtn.contains(target))) {
        setPanelMenuOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setPanelMenuOpen(false);
        if (!dom.lightbox.hidden) {
          closeLightbox();
          return;
        }
        selectedPhotoId = null;
        updateSelectedPhotoState();
        return;
      }

      if (event.key === "F2" && !event.repeat && !isTypingTarget(event.target) && renameSelectedPhoto()) {
        event.preventDefault();
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key !== "shanlic-photography-map-v1") {
        return;
      }
      reloadState();
      if (!getActiveAnchor(state)) {
        window.location.href = "./index.html";
        return;
      }
      render();
    });

    desktopBridge?.onMirroredStorageChanged?.((moduleId) => {
      if (moduleId !== "photography") {
        return;
      }
      desktopBridge.reloadMirroredStorage?.();
      reloadState();
      if (!getActiveAnchor(state)) {
        window.location.href = "./index.html";
        return;
      }
      render();
      void refreshStorageInfo();
    });
  }

  function reloadState() {
    state = loadState();
    const anchor = getActiveAnchor(state);
    const album = getActiveAlbum(state, anchor);

    if (!anchor || !album) {
      if (viewMode === "album") {
        animateShelfEntry = true;
      }
      viewMode = "shelf";
    }

    if (viewMode !== "album" || !album || !album.photos.some((photo) => photo.id === selectedPhotoId)) {
      selectedPhotoId = null;
    }

    syncLightbox();
  }

  function commit(mutator, successMessage = "") {
    const previousState = structuredClone(state);
    mutator();

    if (!saveState(state)) {
      state = previousState;
      reloadState();
      render();
      showToast(TEXT.saveError);
      return false;
    }

    reloadState();
    render();
    if (successMessage) {
      showToast(successMessage);
    }
    return true;
  }

  function render() {
    const anchor = getActiveAnchor(state);
    if (!anchor) {
      return;
    }

    const album = getActiveAlbum(state, anchor);
    dom.galleryTitle.textContent = anchor.name;
    dom.galleryStatus.textContent = `${anchor.provinceName} · ${anchor.albums.length} 个相册 · ${getPhotoCount(anchor)} 张照片`;
    dom.anchorNameInput.value = anchor.name;
    dom.anchorProvinceValue.textContent = `所在省份 · ${anchor.provinceName}`;
    dom.anchorPositionValue.textContent = `地图坐标 · ${Math.round(anchor.x)} / ${Math.round(anchor.y)}`;
    dom.anchorAlbumCountValue.textContent = `${anchor.albums.length} 个相册`;
    dom.anchorPhotoCountValue.textContent = `${getPhotoCount(anchor)} 张照片`;

    dom.addPhotosBtn.disabled = !album || migrationBusy;
    dom.deleteAlbumBtn.disabled = !album || migrationBusy;
    dom.deleteAnchorBtn.disabled = migrationBusy;

    renderStoragePanel();
    renderToolbar(anchor, album);
    renderShelf(anchor);
    renderPhotoGrid(album);
    renderEmpty(anchor, album);
    syncLightbox();
  }

  function renderToolbar(anchor, album) {
    if (viewMode === "album" && album) {
      dom.albumBackBtn.hidden = false;
      dom.contentTitle.textContent = album.name;
      dom.contentSubtitle.textContent = `创建于 ${formatDateTime(album.createdAt)} · ${album.photos.length} 张照片 · 点击照片后按 F2 可重命名`;
      return;
    }

    dom.albumBackBtn.hidden = true;
    dom.contentTitle.textContent = "相册书架";
    dom.contentSubtitle.textContent = anchor.albums.length > 0
      ? "点击封面进入相册，创建时间会显示在相册卡片上。"
      : "先新建一个相册，再把摄影作品放进来。";
  }

  function renderShelf(anchor) {
    dom.albumShelf.hidden = viewMode !== "shelf";
    dom.albumShelf.replaceChildren();

    if (viewMode !== "shelf") {
      return;
    }

    anchor.albums.forEach((album, index) => {
      const coverPhoto = album.photos.find((photo) => photo.id === album.coverPhotoId) || album.photos[0] || null;
      const card = element("article", {
        className: "album-card",
        title: `创建于 ${formatDateTime(album.createdAt)}`,
      });

      if (animateShelfEntry) {
        card.classList.add("module-pop-stagger", "is-bounce");
        card.style.setProperty("--module-pop-index", String(index));
      }

      const coverButton = element("button", {
        className: "album-cover",
        type: "button",
      });
      coverButton.setAttribute("aria-label", `打开相册 ${album.name}`);
      coverButton.addEventListener("click", () => openAlbum(album.id));

      if (coverPhoto) {
        coverButton.append(element("img", {
          src: resolvePhotoSource(coverPhoto),
          alt: album.name,
        }));
      } else {
        coverButton.append(element("div", {
          className: "album-cover-placeholder",
          textContent: album.name.slice(0, 2) || "相册",
        }));
      }

      coverButton.append(element("span", {
        className: "album-badge",
        textContent: `${album.photos.length} 张`,
      }));

      const body = element("div", { className: "album-card-body" });
      const enterButton = element("button", {
        className: "gallery-delete-btn album-enter-btn",
        type: "button",
        textContent: "进入相册",
      });
      enterButton.addEventListener("click", () => openAlbum(album.id));

      body.append(
        element("strong", { textContent: album.name }),
        element("span", {
          className: "album-card-meta",
          textContent: `创建于 ${formatDateTime(album.createdAt)}`,
        }),
        enterButton,
      );

      card.append(coverButton, body);
      dom.albumShelf.append(card);
    });

    animateShelfEntry = false;
  }

  function renderPhotoGrid(album) {
    dom.photoGrid.hidden = viewMode !== "album" || !album;
    dom.photoGrid.replaceChildren();

    if (viewMode !== "album" || !album) {
      animateAlbumEntry = false;
      return;
    }

    album.photos.forEach((photo, index) => {
      const card = element("article", {
        className: "photo-card",
        title: `${photo.name} · ${formatDateTime(photo.createdAt)}`,
        tabIndex: 0,
      });
      card.dataset.photoId = photo.id;

      if (photo.id === selectedPhotoId) {
        card.classList.add("is-selected");
      }

      if (animateAlbumEntry) {
        card.classList.add("photo-card--entering");
        card.style.setProperty("--enter-index", String(index));
      }

      card.addEventListener("click", (event) => {
        if (!(event.target instanceof HTMLElement) || !event.target.closest(".photo-action-btn")) {
          selectedPhotoId = photo.id;
          updateSelectedPhotoState();
        }
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          selectedPhotoId = photo.id;
          openLightbox(photo);
        }
        if (event.key === " ") {
          event.preventDefault();
          selectedPhotoId = photo.id;
          updateSelectedPhotoState();
        }
      });

      const previewButton = element("button", {
        className: "gallery-preview photo-preview",
        type: "button",
      });
      previewButton.setAttribute("aria-label", `预览 ${photo.name}`);
      previewButton.addEventListener("click", () => {
        selectedPhotoId = photo.id;
        openLightbox(photo);
      });
      previewButton.append(element("img", {
        src: resolvePhotoSource(photo),
        alt: photo.name,
      }));

      if (album.coverPhotoId === photo.id) {
        previewButton.append(element("span", {
          className: "photo-cover-flag",
          textContent: "封面",
        }));
      }

      const coverButton = element("button", {
        className: "gallery-delete-btn photo-action-btn",
        type: "button",
        textContent: album.coverPhotoId === photo.id ? "当前封面" : "设为封面",
      });
      coverButton.disabled = album.coverPhotoId === photo.id;
      coverButton.addEventListener("click", () => {
        selectedPhotoId = photo.id;
        setAlbumCover(album.id, photo.id);
      });

      const deleteButton = element("button", {
        className: "gallery-delete-btn photo-action-btn",
        type: "button",
        textContent: "删除照片",
      });
      deleteButton.addEventListener("click", () => {
        selectedPhotoId = photo.id;
        deletePhoto(album.id, photo.id);
      });

      const actions = element("div", { className: "photo-card-actions" });
      actions.append(coverButton, deleteButton);

      const media = element("div", { className: "photo-card-media" });
      media.append(previewButton, actions);

      card.append(
        media,
        element("div", {
          className: "photo-file-name",
          textContent: photo.name,
        }),
      );

      dom.photoGrid.append(card);
    });

    animateAlbumEntry = false;
  }

  function renderEmpty(anchor, album) {
    if (viewMode === "album" && album) {
      const isEmpty = album.photos.length === 0;
      dom.galleryEmpty.hidden = !isEmpty;
      dom.galleryEmptyTitle.textContent = TEXT.emptyAlbum;
      dom.galleryEmptyText.textContent = "点击左上角菜单里的“导入照片”，先放几张作品进来，再选择一张作为封面。";
      return;
    }

    dom.galleryEmpty.hidden = anchor.albums.length > 0;
    dom.galleryEmptyTitle.textContent = TEXT.emptyShelf;
    dom.galleryEmptyText.textContent = "点击左上角菜单里的“新建相册”，开始整理你的摄影作品。";
  }

  function openAlbum(albumId) {
    animateAlbumEntry = true;
    commit(() => {
      const anchor = getActiveAnchor(state);
      if (!anchor || !getAlbumById(anchor, albumId)) {
        return;
      }
      anchor.activeAlbumId = albumId;
      viewMode = "album";
      selectedPhotoId = null;
    });
  }

  function handleAnchorRename() {
    const anchor = getActiveAnchor(state);
    if (!anchor) {
      return;
    }

    const nextName = dom.anchorNameInput.value.trim().slice(0, 32) || anchor.name;
    if (nextName === anchor.name) {
      return;
    }

    commit(() => {
      const activeAnchor = getActiveAnchor(state);
      if (activeAnchor) {
        activeAnchor.name = nextName;
      }
    });
  }

  function handleCreateAlbum() {
    const anchor = getActiveAnchor(state);
    if (!anchor) {
      return;
    }

    const inputName = window.prompt("请输入相册名称：", createAlbumName(anchor));
    if (inputName === null) {
      return;
    }

    animateAlbumEntry = true;
    commit(() => {
      const target = getActiveAnchor(state);
      if (!target) {
        return;
      }

      const album = {
        id: createId("album"),
        name: inputName.trim().slice(0, 40) || createAlbumName(anchor),
        createdAt: new Date().toISOString(),
        coverPhotoId: null,
        photos: [],
      };
      target.albums.unshift(album);
      target.activeAlbumId = album.id;
      viewMode = "album";
      selectedPhotoId = null;
    }, TEXT.createAlbum);

    setPanelMenuOpen(false);
  }

  async function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    dom.photoInput.value = "";

    const album = getActiveAlbum(state, getActiveAnchor(state));
    if (files.length === 0 || !album) {
      return;
    }

    const previousState = structuredClone(state);
    const previousLabel = dom.addPhotosBtn.textContent;
    const imported = [];
    dom.addPhotosBtn.disabled = true;
    dom.addPhotosBtn.textContent = "导入中...";

    try {
      for (const file of files) {
        imported.push(await serializePhotoFile(file));
      }

      const targetAlbum = getActiveAlbum(state, getActiveAnchor(state));
      if (!targetAlbum) {
        throw new Error("Target album is missing.");
      }

      targetAlbum.photos.unshift(...imported);
      if (!targetAlbum.coverPhotoId) {
        targetAlbum.coverPhotoId = imported[0]?.id || targetAlbum.photos[0]?.id || null;
      }
      selectedPhotoId = imported[0]?.id || selectedPhotoId;

      if (!saveState(state)) {
        await deletePhotoAssets(collectPhotoFilePaths(imported));
        state = previousState;
        reloadState();
        render();
        showToast(TEXT.saveError);
        return;
      }

      reloadState();
      render();
      showToast(TEXT.addPhotos);
    } catch (error) {
      console.error(error);
      await deletePhotoAssets(collectPhotoFilePaths(imported));
      state = previousState;
      reloadState();
      render();
      showToast(TEXT.uploadError);
    } finally {
      dom.addPhotosBtn.disabled = !getActiveAlbum(state) || migrationBusy;
      dom.addPhotosBtn.textContent = previousLabel;
    }
  }

  function handleDeleteAlbum() {
    const album = getActiveAlbum(state, getActiveAnchor(state));
    if (!album || !window.confirm(`确定删除相册“${album.name}”吗？这个相册里的照片也会一起删除。`)) {
      return;
    }

    const photoPaths = collectAlbumPhotoPaths(album);
    animateShelfEntry = true;
    const deleted = commit(() => {
      const anchor = getActiveAnchor(state);
      if (!anchor) {
        return;
      }
      anchor.albums = anchor.albums.filter((item) => item.id !== album.id);
      anchor.activeAlbumId = anchor.albums[0]?.id || null;
      viewMode = "shelf";
      selectedPhotoId = null;
      closeLightbox();
    }, TEXT.deleteAlbum);

    if (deleted) {
      void deletePhotoAssets(photoPaths);
    }
  }

  function handleDeleteAnchor() {
    const anchor = getActiveAnchor(state);
    if (!anchor || !window.confirm(`确定删除地点“${anchor.name}”吗？里面所有相册和照片都会一起移除。`)) {
      return;
    }

    const photoPaths = collectAnchorPhotoPaths(anchor);
    const deleted = commit(() => {
      state.anchors = state.anchors.filter((item) => item.id !== anchor.id);
      state.activeAnchorId = state.anchors[0]?.id || null;
      viewMode = "shelf";
      selectedPhotoId = null;
      closeLightbox();
    }, TEXT.deleteAnchor);

    if (deleted) {
      void deletePhotoAssets(photoPaths);
      setPanelMenuOpen(false);
      window.location.href = "./index.html";
    }
  }

  function setAlbumCover(albumId, photoId) {
    commit(() => {
      const album = getAlbumById(getActiveAnchor(state), albumId);
      if (album) {
        album.coverPhotoId = photoId;
      }
    }, TEXT.setCover);
  }

  function deletePhoto(albumId, photoId) {
    const album = getAlbumById(getActiveAnchor(state), albumId);
    const photo = getPhotoById(album, photoId);
    if (!photo || !window.confirm(`确定删除照片“${photo.name}”吗？`)) {
      return;
    }

    const photoPaths = collectPhotoFilePaths([photo]);
    const deleted = commit(() => {
      const targetAlbum = getAlbumById(getActiveAnchor(state), albumId);
      if (!targetAlbum) {
        return;
      }
      targetAlbum.photos = targetAlbum.photos.filter((item) => item.id !== photoId);
      if (targetAlbum.coverPhotoId === photoId) {
        targetAlbum.coverPhotoId = targetAlbum.photos[0]?.id || null;
      }
      if (selectedPhotoId === photoId) {
        selectedPhotoId = null;
      }
      if (lightboxPhotoId === photoId) {
        closeLightbox();
      }
    }, TEXT.deletePhoto);

    if (deleted) {
      void deletePhotoAssets(photoPaths);
    }
  }

  function renameSelectedPhoto() {
    const photo = getPhotoById(getActiveAlbum(state), selectedPhotoId);
    if (viewMode !== "album" || !photo) {
      showToast(TEXT.selectPhotoFirst);
      return true;
    }

    const inputName = window.prompt("修改照片名称：", photo.name);
    if (inputName === null) {
      return true;
    }

    const nextName = sanitizePhotoName(inputName, photo.name);
    if (nextName === photo.name) {
      return true;
    }

    commit(() => {
      const targetPhoto = getPhotoById(getActiveAlbum(state), selectedPhotoId);
      if (targetPhoto) {
        targetPhoto.name = nextName;
      }
    }, TEXT.renamePhoto);

    return true;
  }

  function openLightbox(photo) {
    lightboxPhotoId = photo.id;
    dom.lightboxImage.src = resolvePhotoSource(photo);
    dom.lightboxImage.alt = photo.name;
    dom.lightboxCaption.textContent = `${photo.name} · ${formatDateTime(photo.createdAt)}`;
    dom.lightbox.hidden = false;
    updateSelectedPhotoState();
  }

  function closeLightbox() {
    dom.lightbox.hidden = true;
    lightboxPhotoId = null;
    dom.lightboxImage.src = "";
    dom.lightboxCaption.textContent = "";
  }

  function syncLightbox() {
    if (dom.lightbox.hidden || !lightboxPhotoId) {
      return;
    }

    const photo = getPhotoById(getActiveAlbum(state), lightboxPhotoId);
    if (!photo) {
      closeLightbox();
      return;
    }

    dom.lightboxImage.src = resolvePhotoSource(photo);
    dom.lightboxImage.alt = photo.name;
    dom.lightboxCaption.textContent = `${photo.name} · ${formatDateTime(photo.createdAt)}`;
  }

  function collectAlbumPhotoPaths(album) {
    return collectPhotoFilePaths(album?.photos || []);
  }

  function collectAnchorPhotoPaths(anchor) {
    if (!anchor || !Array.isArray(anchor.albums)) {
      return [];
    }
    return anchor.albums.flatMap((album) => collectAlbumPhotoPaths(album));
  }

  async function deletePhotoAssets(filePaths) {
    if (!desktopBridge?.deletePhotographyPhotos || !Array.isArray(filePaths) || filePaths.length === 0) {
      return;
    }

    try {
      await desktopBridge.deletePhotographyPhotos(filePaths);
    } catch (error) {
      console.error(error);
    }
  }

  async function migrateEmbeddedPhotosIfNeeded() {
    if (migrationBusy || !desktopBridge?.savePhotographyPhoto) {
      return;
    }

    const legacyPhotos = [];
    state.anchors.forEach((anchor) => {
      anchor.albums.forEach((album) => {
        album.photos.forEach((photo) => {
          if (photoNeedsExternalization(photo)) {
            legacyPhotos.push(photo);
          }
        });
      });
    });

    if (legacyPhotos.length === 0) {
      return;
    }

    const previousState = structuredClone(state);
    const migratedPaths = [];
    migrationBusy = true;
    render();

    try {
      for (const photo of legacyPhotos) {
        const saved = await desktopBridge.savePhotographyPhoto({
          dataUrl: photo.dataUrl,
          originalName: photo.name,
          displayName: photo.name,
          createdAt: photo.createdAt,
        });

        if (!saved?.filePath) {
          throw new Error("Failed to externalize photography photo.");
        }

        photo.assetFileName = saved.fileName || "";
        photo.filePath = saved.filePath;
        photo.dataUrl = "";
        migratedPaths.push(saved.filePath);
      }

      if (!saveState(state)) {
        throw new Error("Failed to persist externalized photography state.");
      }

      reloadState();
      render();
      showToast(TEXT.migrateSuccess);
    } catch (error) {
      console.error(error);
      await deletePhotoAssets(migratedPaths);
      state = previousState;
      reloadState();
      render();
      showToast(TEXT.migrateError);
    } finally {
      migrationBusy = false;
      render();
      await refreshStorageInfo();
    }
  }

  function updateSelectedPhotoState() {
    dom.photoGrid.querySelectorAll(".photo-card").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.photoId === selectedPhotoId);
    });
  }

  function setPanelMenuOpen(open) {
    dom.panelMenu.hidden = !open;
    dom.panelToggleBtn.setAttribute("aria-expanded", String(open));
    dom.panelToggleBtn.textContent = open ? "×" : "+";
  }

  async function refreshStorageInfo() {
    if (!desktopBridge?.getMirroredStorageInfo || !dom.storagePanel) {
      if (dom.storagePanel) {
        dom.storagePanel.hidden = true;
      }
      return;
    }

    try {
      storageInfo = await desktopBridge.getMirroredStorageInfo();
    } catch {
      storageInfo = null;
    }

    renderStoragePanel();
  }

  function renderStoragePanel() {
    if (!dom.storagePanel) {
      return;
    }

    const supported = Boolean(desktopBridge?.getMirroredStorageInfo);
    dom.storagePanel.hidden = !supported;
    if (!supported) {
      return;
    }

    const nextText = storageInfo
      ? [
        storageInfo.usesCustomDirectory ? "当前使用自定义目录" : "当前使用默认目录",
        `目录：${storageInfo.directoryPath || "未初始化"}`,
        `图片文件夹：${storageInfo.assetsDirectoryPath || "未初始化"}`,
        `状态文件：${storageInfo.filePath || "未初始化"}`,
        migrationBusy ? "正在整理历史照片，请稍候..." : "",
      ].filter(Boolean).join("\n")
      : "正在读取保存位置...";

    dom.storagePathValue.textContent = nextText;
    dom.storagePathValue.title = nextText;
    dom.changeStorageDirBtn.disabled = storageBusy || migrationBusy;
    dom.resetStorageDirBtn.disabled = storageBusy || migrationBusy || !storageInfo?.usesCustomDirectory;
  }

  async function handleChangeStorageDirectory() {
    if (storageBusy || migrationBusy || !desktopBridge?.chooseMirroredStorageDirectory) {
      return;
    }

    storageBusy = true;
    renderStoragePanel();
    try {
      const result = await desktopBridge.chooseMirroredStorageDirectory();
      if (!result?.canceled) {
        storageInfo = result;
        reloadState();
        render();
        showToast(TEXT.storageChanged);
      }
    } catch {
      showToast(TEXT.storageError);
    } finally {
      storageBusy = false;
      await refreshStorageInfo();
    }
  }

  async function handleResetStorageDirectory() {
    if (storageBusy || migrationBusy || !desktopBridge?.resetMirroredStorageDirectory) {
      return;
    }

    storageBusy = true;
    renderStoragePanel();
    try {
      const result = await desktopBridge.resetMirroredStorageDirectory();
      if (!result?.canceled) {
        storageInfo = result;
        reloadState();
        render();
        showToast(TEXT.storageReset);
      }
    } catch {
      showToast(TEXT.storageError);
    } finally {
      storageBusy = false;
      await refreshStorageInfo();
    }
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove("show");
    }, 1900);
  }
}

function getDom() {
  const galleryEmpty = document.getElementById("galleryEmpty");
  return {
    panelToggleBtn: document.getElementById("panelToggleBtn"),
    panelMenu: document.getElementById("panelMenu"),
    backToMapBtn: document.getElementById("backToMapBtn"),
    galleryTitle: document.getElementById("galleryTitle"),
    galleryStatus: document.getElementById("galleryStatus"),
    anchorNameInput: document.getElementById("anchorNameInput"),
    anchorProvinceValue: document.getElementById("anchorProvinceValue"),
    anchorPositionValue: document.getElementById("anchorPositionValue"),
    anchorAlbumCountValue: document.getElementById("anchorAlbumCountValue"),
    anchorPhotoCountValue: document.getElementById("anchorPhotoCountValue"),
    storagePanel: document.getElementById("storagePanel"),
    storagePathValue: document.getElementById("storagePathValue"),
    changeStorageDirBtn: document.getElementById("changeStorageDirBtn"),
    resetStorageDirBtn: document.getElementById("resetStorageDirBtn"),
    createAlbumBtn: document.getElementById("createAlbumBtn"),
    addPhotosBtn: document.getElementById("addPhotosBtn"),
    deleteAlbumBtn: document.getElementById("deleteAlbumBtn"),
    deleteAnchorBtn: document.getElementById("deleteAnchorBtn"),
    albumBackBtn: document.getElementById("albumBackBtn"),
    photoInput: document.getElementById("photoInput"),
    galleryEmpty,
    galleryEmptyTitle: galleryEmpty.querySelector("strong"),
    galleryEmptyText: galleryEmpty.querySelector("p"),
    contentTitle: document.getElementById("contentTitle"),
    contentSubtitle: document.getElementById("contentSubtitle"),
    albumShelf: document.getElementById("albumShelf"),
    photoGrid: document.getElementById("photoGrid"),
    lightbox: document.getElementById("lightbox"),
    lightboxImage: document.getElementById("lightboxImage"),
    lightboxCaption: document.getElementById("lightboxCaption"),
    lightboxCloseBtn: document.getElementById("lightboxCloseBtn"),
    toast: document.getElementById("toast"),
  };
}

function element(tagName, props = {}) {
  const node = document.createElement(tagName);
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (key in node) {
      node[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  });
  return node;
}
