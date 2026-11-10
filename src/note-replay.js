import { replayDestination } from './note-location.js';

/** Tab-scoped requests survive worker suspension, but never affect unrelated tabs. */
export function createNoteReplay(api, getNote) {
  const key = id => `kairosReplay:${id}`;
  return {
    async open(id) {
      const note = await getNote(id);
      if (!note) throw Object.assign(new Error('Note no longer exists'), { code: 'REPLAY_NOTE_MISSING' });
      let destination;
      try { destination = replayDestination(note); }
      catch { throw Object.assign(new Error('This note has no valid playback location'), { code: 'REPLAY_LOCATION_INVALID' }); }
      const tab = await api.tabs.create({ url: 'about:blank', active: true });
      try {
        await api.storage.session.set({ [key(tab.id)]: { ...destination, expires: Date.now() + 600000 } });
        await api.tabs.update(tab.id, { url: destination.url });
        return { tabId: tab.id };
      } catch (error) {
        await api.storage.session.remove(key(tab.id));
        await api.tabs.remove(tab.id).catch(() => {});
        throw error;
      }
    },
    async pending(sender) {
      if (!sender.tab || (sender.frameId ?? 0) !== 0) return null;
      const item = (await api.storage.session.get(key(sender.tab.id)))[key(sender.tab.id)];
      if (!item) return null;
      if (item.expires < Date.now()) { await this.clear(sender.tab.id); return null; }
      if (new URL(sender.url).origin !== new URL(item.url).origin) return null;
      return item;
    },
    async clear(tabId) { if (Number.isInteger(tabId)) await api.storage.session.remove(key(tabId)); }
  };
}
