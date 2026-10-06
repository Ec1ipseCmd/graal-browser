(() => {
  const bindings = {F3:'StartOptionsButton', F7:'Serverlist_Taskbar_Menu', F8:'Serverlist_TaskButton_Main'};
  function open(key) {
    if (!Object.hasOwn(bindings, key)) return false;
    if (document.getElementById('imageContainer')?.style.display !== 'none') return false;
    try {
      const native = window.kingdomsAutoJoin?.driver(window.unityInstance?.Module);
      const controls = native?.controls();
      const object = controls?.get(bindings[key]);
      if (!object) return false;
      if (key === 'F7') native.playerList(object, controls.get('PlayerList_Window'));
      else native.action(object);
      return true;
    } catch {
      console.warn('Graal window shortcut unavailable for this client state.');
      return false;
    }
  }
  const held = new Set();
  function handle(event) {
    const target = event.target;
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return false;
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || !Object.hasOwn(bindings, event.key)) return false;
    // Consume both edges so Unity cannot also toggle a window or retain a key.
    if (event.type === 'keyup') {
      if (!held.delete(event.key)) return false;
    } else if (held.has(event.key) || event.repeat) {
      // Holding a function key must not repeatedly open/toggle a window.
    } else {
      if (!open(event.key)) return false;
      held.add(event.key);
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }
  window.kingdomsKeyboard = {handle};
  window.addEventListener('keydown', handle, true);
  window.addEventListener('keyup', handle, true);
  window.addEventListener('blur', () => held.clear());
  // Preserve the official page's suppression of competing browser shortcuts.
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '')) return;
    if (/^F[1-8]$/.test(event.key) || (event.ctrlKey && event.key.length === 1 && 'sfwertuopdghjkzn'.includes(event.key.toLowerCase()))) event.preventDefault();
  });
})();
