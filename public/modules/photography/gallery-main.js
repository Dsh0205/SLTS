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
      if (desktopBridge?.pickPhotographyPhotos) {
        void handleDesktopPhotoImport();
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

      if (event.key === "F2" && !event.repeat && !isTypingTarget(event.target)) {
        event.preventDefault();
        void renameSelectedPhoto();
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
    dom.galleryStatus.hidden = true;
    dom.galleryStatus.textContent = "";
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
    dom.contentSubtitle.hidden = true;
    dom.contentSubtitle.textContent = "";

    if (viewMode === "album" && album) {
      dom.albumBackBtn.hidden = false;
      dom.contentTitle.textContent = album.name;
      return;
    }

    dom.albumBackBtn.hidden = true;
    dom.contentTitle.textContent = "相册书架";
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

      const renameButton = element("button", {
        className: "gallery-delete-btn photo-action-btn",
        type: "button",
        textContent: "修改昵称",
      });
      renameButton.addEventListener("click", () => {
        selectedPhotoId = photo.id;
        void renameSelectedPhoto(photo.id);
      });

      const deleteButton = element("button", {
        className: "gallery-delete-btn photo-action-btn",
        type: "button",
        textContent: "删除照片",
      });
      deleteButton.addEventListener("click", () => {
        selectedPhotoId = photo.id;
        void deletePhoto(album.id, photo.id);
      });

      const actions = element("div", { className: "photo-card-actions" });
      actions.append(coverButton, renameButton, deleteButton);

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
    dom.galleryEmpty.hidden = true;
    dom.galleryEmptyTitle.textContent = "";
    dom.galleryEmptyText.textContent = "";
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

  async function handleCreateAlbum() {
    const anchor = getActiveAnchor(state);
    if (!anchor) {
      return;
    }

    const inputName = await requestTextInput({
      title: "新建相册",
      message: "请输入相册名称。",
      label: "相册名称",
      defaultValue: createAlbumName(anchor),
      confirmText: "创建相册",
      maxLength: 40,
    });
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

  async function handleDesktopPhotoImport() {
    if (!desktopBridge?.pickPhotographyPhotos) {
      return;
    }

    const album = getActiveAlbum(state, getActiveAnchor(state));
    if (!album) {
      return;
    }

    const previousLabel = dom.addPhotosBtn.textContent;
    dom.addPhotosBtn.disabled = true;
    dom.addPhotosBtn.textContent = "导入中...";

    try {
      const result = await desktopBridge.pickPhotographyPhotos();
      if (result?.canceled) {
        return;
      }

      const imported = Array.isArray(result?.photos)
        ? result.photos.map((photo) => createDesktopImportedPhoto(photo)).filter(Boolean)
        : [];

      if (imported.length === 0) {
        return;
      }

      await commitImportedPhotos(imported);
    } catch (error) {
      console.error(error);
      showToast(TEXT.uploadError);
    } finally {
      dom.addPhotosBtn.disabled = !getActiveAlbum(state) || migrationBusy;
      dom.addPhotosBtn.textContent = previousLabel;
    }
  }

  async function handlePhotoSelectionLegacy(event) {
    const files = Array.from(event.target.files || []).filter(isSupportedImageFile);
    dom.photoInput.value = "";

    const album = getActiveAlbum(state, getActiveAnchor(state));
    if (files.length === 0 || !album) {
      return;
    }

    const previousLabel = dom.addPhotosBtn.textContent;
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

  async function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || []).filter(isSupportedImageFile);
    dom.photoInput.value = "";

    const album = getActiveAlbum(state, getActiveAnchor(state));
    if (files.length === 0 || !album) {
      return;
    }

    const previousLabel = dom.addPhotosBtn.textContent;
    dom.addPhotosBtn.disabled = true;
    dom.addPhotosBtn.textContent = "导入中...";

    try {
      const imported = [];
      for (const file of files) {
        imported.push(await serializePhotoFile(file));
      }

      await commitImportedPhotos(imported);
    } catch (error) {
      console.error(error);
      showToast(TEXT.uploadError);
    } finally {
      dom.addPhotosBtn.disabled = !getActiveAlbum(state) || migrationBusy;
      dom.addPhotosBtn.textContent = previousLabel;
    }
  }

  async function commitImportedPhotos(imported) {
    const album = getActiveAlbum(state, getActiveAnchor(state));
    if (!Array.isArray(imported) || imported.length === 0 || !album) {
      return;
    }

    const previousState = structuredClone(state);

    try {
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
        throw new Error("Failed to persist imported photos.");
      }

      reloadState();
      render();
      showToast(TEXT.addPhotos);
    } catch (error) {
      await deletePhotoAssets(collectPhotoFilePaths(imported));
      state = previousState;
      reloadState();
      render();
      throw error;
    }
  }

  function createDesktopImportedPhoto(photo) {
    if (!photo?.filePath) {
      return null;
    }

    const createdAt = new Date().toISOString();
    const name = sanitizePhotoName(photo.originalName || photo.fileName, "未命名照片");
    return {
      id: createId("photo"),
      name,
      assetFileName: photo.fileName || "",
      filePath: photo.filePath,
      createdAt,
    };
  }

  async function handleDeleteAlbum() {
    const album = getActiveAlbum(state, getActiveAnchor(state));
    if (!album) {
      return;
    }

    const confirmed = await requestConfirmation({
      title: "删除相册",
      message: `确定删除相册“${album.name}”吗？这个相册里的照片也会一起删除。`,
      confirmText: "删除相册",
    });
    if (!confirmed) {
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

  async function handleDeleteAnchor() {
    const anchor = getActiveAnchor(state);
    if (!anchor) {
      return;
    }

    const confirmed = await requestConfirmation({
      title: "删除地点",
      message: `确定删除地点“${anchor.name}”吗？里面所有相册和照片都会一起移除。`,
      confirmText: "删除地点",
    });
    if (!confirmed) {
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

  async function deletePhoto(albumId, photoId) {
    const album = getAlbumById(getActiveAnchor(state), albumId);
    const photo = getPhotoById(album, photoId);
    if (!photo) {
      return;
    }

    const confirmed = await requestConfirmation({
      title: "删除照片",
      message: `确定删除照片“${photo.name}”吗？`,
      confirmText: "删除照片",
    });
    if (!confirmed) {
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

  async function renameSelectedPhoto(photoId = selectedPhotoId) {
    const photo = getPhotoById(getActiveAlbum(state), photoId);
    if (viewMode !== "album" || !photo) {
      showToast(TEXT.selectPhotoFirst);
      return;
    }

    const inputName = await requestTextInput({
      title: "重命名照片",
      message: "请输入新的照片名称。",
      label: "照片名称",
      defaultValue: photo.name,
      confirmText: "保存名称",
      maxLength: 80,
    });
    if (inputName === null) {
      return;
    }

    const nextName = sanitizePhotoName(inputName, photo.name);
    if (nextName === photo.name) {
      return;
    }

    commit(() => {
      const targetPhoto = getPhotoById(getActiveAlbum(state), photoId);
      if (targetPhoto) {
        targetPhoto.name = nextName;
      }
    }, TEXT.renamePhoto);
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
    dom.panelToggleBtn.classList.toggle("is-open", open);
    dom.panelToggleBtn.setAttribute("aria-label", open ? "关闭操作菜单" : "打开操作菜单");
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

  function isSupportedImageFile(file) {
    if (!file) {
      return false;
    }

    if (typeof file.type === "string" && file.type.startsWith("image/")) {
      return true;
    }

    return /\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(String(file.name || ""));
  }

  async function requestTextInput(options = {}) {
    if (!(dom.actionDialog instanceof HTMLDialogElement) || !(dom.actionDialogInput instanceof HTMLInputElement)) {
      const fallbackValue = typeof window.prompt === "function"
        ? window.prompt(options.message || "请输入名称：", options.defaultValue || "")
        : options.defaultValue || "";
      return fallbackValue === null ? null : String(fallbackValue);
    }

    const result = await openActionDialog({
      title: options.title || "请输入名称",
      message: options.message || "请输入内容。",
      label: options.label || "名称",
      defaultValue: options.defaultValue || "",
      confirmText: options.confirmText || "确定",
      cancelText: options.cancelText || "取消",
      showInput: true,
      maxLength: options.maxLength || 40,
    });

    return result.confirmed ? result.value : null;
  }

  async function requestConfirmation(options = {}) {
    if (!(dom.actionDialog instanceof HTMLDialogElement)) {
      return typeof window.confirm === "function"
        ? window.confirm(options.message || "确定继续吗？")
        : false;
    }

    const result = await openActionDialog({
      title: options.title || "操作确认",
      message: options.message || "请确认当前操作。",
      confirmText: options.confirmText || "确定",
      cancelText: options.cancelText || "取消",
      showInput: false,
    });

    return result.confirmed;
  }

  function openActionDialog(options = {}) {
    if (!(dom.actionDialog instanceof HTMLDialogElement)) {
      return Promise.resolve({ confirmed: false, value: "" });
    }

    if (dom.actionDialog.open) {
      dom.actionDialog.close("cancel");
    }

    dom.actionDialogTitle.textContent = options.title || "操作确认";
    dom.actionDialogMessage.textContent = options.message || "请确认当前操作。";
    dom.actionDialogConfirmBtn.textContent = options.confirmText || "确定";
    dom.actionDialogCancelBtn.textContent = options.cancelText || "取消";

    const showInput = Boolean(options.showInput);
    dom.actionDialogField.hidden = !showInput;
    dom.actionDialogInput.value = showInput ? String(options.defaultValue || "") : "";
    dom.actionDialogInput.maxLength = Number(options.maxLength) || 40;
    dom.actionDialogInput.placeholder = showInput ? String(options.placeholder || "") : "";
    dom.actionDialogLabel.textContent = options.label || "名称";

    return new Promise((resolve) => {
      const handleClose = () => {
        resolve({
          confirmed: dom.actionDialog.returnValue === "confirm",
          value: dom.actionDialogInput.value,
        });
      };

      dom.actionDialog.addEventListener("close", handleClose, { once: true });

      try {
        dom.actionDialog.showModal();
        window.requestAnimationFrame(() => {
          if (showInput) {
            dom.actionDialogInput.focus();
            dom.actionDialogInput.select();
            return;
          }

          dom.actionDialogConfirmBtn.focus();
        });
      } catch {
        dom.actionDialog.removeEventListener("close", handleClose);
        resolve({ confirmed: false, value: "" });
      }
    });
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
    actionDialog: document.getElementById("actionDialog"),
    actionDialogTitle: document.getElementById("actionDialogTitle"),
    actionDialogMessage: document.getElementById("actionDialogMessage"),
    actionDialogField: document.getElementById("actionDialogField"),
    actionDialogLabel: document.getElementById("actionDialogLabel"),
    actionDialogInput: document.getElementById("actionDialogInput"),
    actionDialogCancelBtn: document.getElementById("actionDialogCancelBtn"),
    actionDialogConfirmBtn: document.getElementById("actionDialogConfirmBtn"),
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
