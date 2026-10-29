// Publication dans le dépôt GitHub public en un seul commit (API Git Data), avec le jeton PUBLISH_TOKEN.

const API = "https://api.github.com";

async function gh(token, path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "eat-it-relay",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  return res;
}

async function ok(res, what) {
  if (!res.ok) throw new Error(`GitHub (${what}) : ${res.status}`);
  return res;
}

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

// build(recipesJsonText) → { message, files: [{ path, text } | { path, base64 }] }
export async function publish(env, build) {
  const repo = env.PUBLISH_REPO;
  const token = env.PUBLISH_TOKEN;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ref = await (await ok(await gh(token, `/repos/${repo}/git/ref/heads/main`), "ref")).json();
    const head = ref.object.sha;
    const commit = await (await ok(await gh(token, `/repos/${repo}/git/commits/${head}`), "commit")).json();
    const raw = await ok(
      await gh(token, `/repos/${repo}/contents/data/recipes.json?ref=${head}`, {
        headers: { Accept: "application/vnd.github.raw+json" },
      }),
      "recipes.json"
    );
    const { message, files } = build(await raw.text(), head);

    const tree = [];
    for (const f of files) {
      const blob = await (
        await ok(
          await gh(token, `/repos/${repo}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({ content: f.base64 || toBase64(f.text), encoding: "base64" }),
          }),
          "blob"
        )
      ).json();
      tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const newTree = await (
      await ok(
        await gh(token, `/repos/${repo}/git/trees`, {
          method: "POST",
          body: JSON.stringify({ base_tree: commit.tree.sha, tree }),
        }),
        "tree"
      )
    ).json();
    const made = await (
      await ok(
        await gh(token, `/repos/${repo}/git/commits`, {
          method: "POST",
          body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }),
        }),
        "commit"
      )
    ).json();
    const upd = await gh(token, `/repos/${repo}/git/refs/heads/main`, {
      method: "PATCH",
      body: JSON.stringify({ sha: made.sha, force: false }),
    });
    if (upd.ok) return made.sha;
    if (upd.status !== 422) throw new Error(`GitHub (ref) : ${upd.status}`);
    // Quelqu'un a poussé entre-temps : on recommence à partir du nouveau sommet.
  }
  throw new Error("Publication impossible (le dépôt change trop vite), réessaie.");
}
