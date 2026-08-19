import { describe, it, expect, vi, beforeEach } from "vitest";
import { Writable } from "stream";

const mockUploadStream = vi.fn();

vi.mock("../../../config/cloudinary.js", () => ({
  default: {
    uploader: {
      upload_stream: (options, callback) => mockUploadStream(options, callback),
    },
  },
}));

import { uploadBufferToCloudinary } from "../../../utils/uploadToCloudinary.js";

function fakeWritableSink() {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

describe("uploadToCloudinary.uploadBufferToCloudinary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with the Cloudinary result on a successful upload", async () => {
    mockUploadStream.mockImplementation((_options, callback) => {
      setImmediate(() =>
        callback(null, { secure_url: "https://cloudinary.test/x.png", public_id: "abc123" })
      );
      return fakeWritableSink();
    });

    const result = await uploadBufferToCloudinary(Buffer.from("data"), { folder: "kyc" });

    expect(result).toEqual({ secure_url: "https://cloudinary.test/x.png", public_id: "abc123" });
    expect(mockUploadStream).toHaveBeenCalledWith({ folder: "kyc" }, expect.any(Function));
  });

  it("rejects (does not silently swallow) when Cloudinary reports an upload failure", async () => {
    mockUploadStream.mockImplementation((_options, callback) => {
      setImmediate(() => callback(new Error("cloudinary upload failed"), null));
      return fakeWritableSink();
    });

    await expect(uploadBufferToCloudinary(Buffer.from("data"))).rejects.toThrow(
      "cloudinary upload failed"
    );
  });

  it("rejects immediately when no file buffer is provided, without calling Cloudinary", async () => {
    await expect(uploadBufferToCloudinary(null)).rejects.toThrow(
      "File buffer is required for Cloudinary upload"
    );
    expect(mockUploadStream).not.toHaveBeenCalled();
  });
});
