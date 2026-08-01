import { $getNodeByKey, $getRoot, $getSelection, $isRangeSelection } from "lexical"

import Lexxy from "../../config/lexxy"
import { createElement, dispatch } from "../../helpers/html_helper"
import { ActionTextAttachmentUploadNode, AttachmentNodeConversion } from "../../nodes/action_text_attachment_upload_node"

let nextDeferredUploadKey = 0

// Uploads files without inserting anything into the document: a local
// progress card renders under the editor, and the finished attachment node
// is inserted only when its upload completes. Nothing provisional enters the
// editor state. Collaborative documents need this: every inserted node syncs
// to peers, so an upload abandoned mid-flight (closed tab) would otherwise
// strand a placeholder in the shared document.
export class DeferredUploader {
  constructor(editorElement, files) {
    this.editorElement = editorElement
    this.editor = editorElement.editor
    this.files = Array.from(files)
  }

  // Runs inside the editor.update() that contents.uploadFiles opened:
  // capture the insertion anchor synchronously, upload outside the update.
  $uploadFiles() {
    this.anchorKey = this.#captureAnchorKey()
    queueMicrotask(() => this.files.forEach(file => this.#upload(file)))
  }

  #captureAnchorKey() {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return null
    try {
      return selection.anchor.getNode().getTopLevelElementOrThrow().getKey()
    } catch {
      return null
    }
  }

  async #upload(file) {
    const card = this.#appendCard(file)
    const key = `deferred-upload-${nextDeferredUploadKey++}`

    const { DirectUpload } = await import("@rails/activestorage")
    const upload = new DirectUpload(file, this.editorElement.directUploadUrl, this.#delegateFor(card, key, file))

    dispatch(this.editorElement, "lexxy:upload-start", { file, deferred: true })

    upload.create((error, blob) => {
      this.editorElement.uploadRequests.forget(key)
      dispatch(this.editorElement, "lexxy:upload-end", { file, error: error || null, deferred: true })

      if (error) {
        console.warn(`Upload error for ${file.name}: ${error}`)
        this.#showError(card)
      } else {
        card.remove()
        this.#insertAttachment(file, blob)
      }
    })
  }

  #delegateFor(card, key, file) {
    const shouldAuthenticateUploads = Lexxy.global.get("authenticatedUploads")
    const progressBar = card.querySelector("progress")

    return {
      directUploadWillCreateBlobWithXHR: (request) => {
        if (shouldAuthenticateUploads) request.withCredentials = true
      },
      directUploadWillStoreFileWithXHR: (request) => {
        if (shouldAuthenticateUploads) request.withCredentials = true

        this.editorElement.uploadRequests.track(key, request)

        request.upload.addEventListener("progress", (event) => {
          const progress = Math.round(event.loaded / event.total * 100)
          progressBar.value = progress
          dispatch(this.editorElement, "lexxy:upload-progress", { file, progress, deferred: true })
        })
      }
    }
  }

  #insertAttachment(file, blob) {
    this.editor.update(() => {
      // A detached upload node, used purely as the property bag the
      // conversion reads; it is never inserted.
      const properties = new ActionTextAttachmentUploadNode({
        file,
        uploadUrl: this.editorElement.directUploadUrl,
        blobUrlTemplate: this.editorElement.blobUrlTemplate,
        contentType: file.type
      })
      const previewSrc = properties.isPreviewableImage && typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null
      const attachment = new AttachmentNodeConversion(properties, blob, previewSrc).toAttachmentNode()

      const anchor = this.anchorKey ? $getNodeByKey(this.anchorKey) : null
      if (anchor && anchor.isAttached()) {
        anchor.insertAfter(attachment)
      } else {
        $getRoot().append(attachment)
      }
    })
  }

  #appendCard(file) {
    const card = createElement("figure", { className: "attachment attachment--file lexxy-deferred-upload" })
    const caption = createElement("figcaption", { className: "attachment__caption" })
    caption.appendChild(createElement("span", { className: "attachment__name", textContent: file.name }))
    card.appendChild(caption)

    const progressBar = createElement("progress")
    progressBar.max = 100
    progressBar.value = 0
    card.appendChild(progressBar)

    this.#container.appendChild(card)
    return card
  }

  get #container() {
    let container = this.editorElement.querySelector(".lexxy-deferred-uploads")
    if (!container) {
      container = createElement("div", { className: "lexxy-deferred-uploads" })
      this.editorElement.appendChild(container)
    }
    return container
  }

  #showError(card) {
    card.classList.add("attachment--error")
    card.querySelector("progress")?.remove()
    card.appendChild(createElement("span", { className: "attachment__error", textContent: "Upload failed" }))
    card.addEventListener("click", () => card.remove(), { once: true })
  }
}
