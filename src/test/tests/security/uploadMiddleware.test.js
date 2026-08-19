import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";

import upload from "../../../middleware/uploadMiddleware.js";

function buildApp() {
  const app = express();

  app.post("/upload", upload.single("file"), (req, res) => {
    res.status(200).json({
      ok: true,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(400).json({ ok: false, message: err.message, code: err.code });
  });

  return app;
}

describe("uploadMiddleware (multer config used for KYC docs / recipe images / profile photos)", () => {
  it("accepts a normal-size image file", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("fake-image-data"), {
        filename: "photo.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe("image/png");
  });

  /**
   * src/middleware/uploadMiddleware.js only configures memoryStorage + a fileSize
   * limit - there is no `fileFilter`. This means the middleware does NOT actually
   * reject unsupported/non-image mimetypes at all; anything under the size limit
   * is accepted. This is a real gap vs. a QA report expectation of "unsupported
   * image type rejected" - documented here rather than "fixed".
   */
  it("accepts a non-image mimetype because no fileFilter is configured (documents an actual gap vs. a report expectation of type-restriction)", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/upload")
      .attach("file", Buffer.from("not an image"), {
        filename: "virus.exe",
        contentType: "application/x-msdownload",
      });

    expect(res.status).toBe(200);
    expect(res.body.mimetype).toBe("application/x-msdownload");
  });

  it("rejects a file exceeding the configured 10MB size limit", async () => {
    const app = buildApp();
    const bigBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);

    const res = await request(app)
      .post("/upload")
      .attach("file", bigBuffer, { filename: "big.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("LIMIT_FILE_SIZE");
  });
});
