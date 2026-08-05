import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createTestEditor, destroyTestEditor } from "../../helpers/editor_helper"

const uploads = []

vi.mock("@rails/activestorage", () => ({
  DirectUpload: class {
    constructor(file, url, delegate) {
      this.file = file
      this.delegate = delegate
      uploads.push(this)
    }

    create(callback) {
      this.callback = callback
    }
  }
}))

let editorElement

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const state = () => JSON.stringify(editorElement.editor.getEditorState().toJSON())

async function uploadFile() {
  const file = new File([ "bytes" ], "photo.png", { type: "image/png" })
  editorElement.contents.uploadFiles([ file ])
  await vi.dynamicImportSettled()
  await flush()
  return file
}

const blob = {
  attachable_sgid: "TEST-SGID",
  signed_id: "SIGNED",
  filename: "photo.png",
  byte_size: 5,
  content_type: "image/png",
  previewable: false
}

describe("deferred upload insertion", () => {
  beforeEach(() => {
    uploads.length = 0
  })

  afterEach(async () => {
    await destroyTestEditor(editorElement)
  })

  test("nothing enters the document until the upload completes", async () => {
    editorElement = await createTestEditor({ attributes: {
      "defer-upload-insertion": "true",
      "data-blob-url-template": "/blobs/:signed_id/:filename"
    } })

    await uploadFile()

    expect(uploads.length).toBe(1)
    expect(state()).not.toContain("action_text_attachment")
    expect(editorElement.querySelector(".lexxy-deferred-uploads figure")).toBeTruthy()

    uploads[0].callback(null, blob)
    await flush()

    expect(state()).toContain("action_text_attachment")
    expect(state()).toContain("TEST-SGID")
    expect(editorElement.querySelector(".lexxy-deferred-uploads figure")).toBeFalsy()
  })

  test("a failed upload inserts nothing and shows a dismissible error", async () => {
    editorElement = await createTestEditor({ attributes: {
      "defer-upload-insertion": "true",
      "data-blob-url-template": "/blobs/:signed_id/:filename"
    } })

    await uploadFile()
    uploads[0].callback("boom", null)
    await flush()

    expect(state()).not.toContain("action_text_attachment")
    const card = editorElement.querySelector(".lexxy-deferred-uploads figure")
    expect(card.classList.contains("attachment--error")).toBe(true)

    card.click()
    expect(editorElement.querySelector(".lexxy-deferred-uploads figure")).toBeFalsy()
  })

  test("without the option, uploads insert the provisional node as before", async () => {
    editorElement = await createTestEditor({ attributes: {
      "data-blob-url-template": "/blobs/:signed_id/:filename"
    } })

    await uploadFile()

    expect(state()).toContain("action_text_attachment_upload")
    expect(editorElement.querySelector(".lexxy-deferred-uploads")).toBeFalsy()
  })
})
