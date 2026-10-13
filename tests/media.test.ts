import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getAsset } from "../src/lib/media";
import type { Asset } from "../src/shared/types";

test("素材缓存：空间不足仍能显示，预下载必须落盘，损坏下载不算成功", async (t) => {
  const blob = new Blob(["a valid asset"], { type: "image/webp" });
  const asset: Asset = {
    id: "asset",
    name: "验收立绘",
    mime: blob.type,
    size: blob.size,
    hash: createHash("sha256")
      .update(Buffer.from(await blob.arrayBuffer()))
      .digest("hex"),
    preload: true,
  };
  const storage = new Map<string, Blob>();
  let readable = true,
    writable = true,
    downloads = 0,
    corrupt = false;
  // Minimal IndexedDB event fake: the behavior under test is download/cache failure handling.
  const fakeDb = {
    transaction(_store: string, mode = "readonly") {
      if (!readable && mode === "readonly") throw new Error("storage denied");
      const tx = {
        oncomplete: () => {},
        onerror: () => {},
        onabort: () => {},
        objectStore() {
          return {
            get(hash: string) {
              const req = {
                result: storage.get(hash),
                onsuccess: () => {},
                onerror: () => {},
              };
              queueMicrotask(() => req.onsuccess());
              return req;
            },
            put(value: Blob, hash: string) {
              queueMicrotask(() => {
                if (!writable) {
                  tx.onabort();
                  return;
                }
                storage.set(hash, value);
                tx.oncomplete();
              });
            },
          };
        },
      };
      return tx;
    },
  };
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (name: string, value: unknown) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    });
  };
  replace("document", { baseURI: "http://localhost/fu/" });
  replace("indexedDB", {
    open: () => {
      const req = {
        result: fakeDb,
        onsuccess: () => {},
        onerror: () => {},
        onblocked: () => {},
      };
      queueMicrotask(() => req.onsuccess());
      return req;
    },
  });
  replace("fetch", async () => {
    downloads++;
    return new Response(corrupt ? new Blob(["b valid asset"]) : blob);
  });
  try {
    await t.test("房间内禁用存储时继续展示，给出缓存警告", async () => {
      readable = false;
      const result = await getAsset("world", asset, { cacheRequired: false });
      assert.equal(await result.blob.text(), await blob.text());
      assert.match(result.warning, /缓存/);
      const before = downloads;
      await assert.rejects(getAsset("world", asset), /storage denied/);
      assert.equal(downloads, before, "无法预存时不做无意义下载");
    });
    await t.test("配额耗尽不遮住舞台，预下载不能报告完成", async () => {
      readable = true;
      writable = false;
      const result = await getAsset("world", asset, { cacheRequired: false });
      assert.equal(result.blob.size, asset.size);
      assert.match(result.warning, /未能保存/);
      await assert.rejects(getAsset("world", asset), /未能保存/);
      assert.equal(storage.size, 0);
    });
    await t.test("完成保存后再次读取不下载，损坏缓存会重新获取", async () => {
      writable = true;
      const first = await getAsset("world", asset);
      assert.equal(first.hit, false);
      assert.equal(first.warning, "");
      const before = downloads;
      assert.equal((await getAsset("world", asset)).hit, true);
      assert.equal(downloads, before);
      storage.set(asset.hash, new Blob(["broken"]));
      assert.equal((await getAsset("world", asset)).hit, false);
      assert.equal(downloads, before + 1);
    });
    await t.test("摘要不符与暂停下载不写入缓存", async () => {
      storage.clear();
      corrupt = true;
      await assert.rejects(getAsset("world", asset), /校验失败/);
      assert.equal(storage.size, 0);
      const before = downloads;
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        getAsset("world", asset, { signal: controller.signal }),
        { name: "AbortError" },
      );
      assert.equal(downloads, before);
    });
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
