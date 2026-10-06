/* Pure timeline calculations shared by the editor and its checks. */
(() => {
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const formatTime = value => {
    const hundredths = Math.round(value * 100);
    return `${String(Math.floor(hundredths / 6000)).padStart(2, '0')}:${String(Math.floor(hundredths / 100) % 60).padStart(2, '0')}.${String(hundredths % 100).padStart(2, '0')}`;
  };
  function bounds(shots, index) {
    const start = round(shots.slice(0, index).reduce((total, shot) => total + shot.duration, 0));
    return {start, end: round(start + shots[index].duration)};
  }
  function changeDuration(shots, index, value, keepTotal, clipDurations) {
    const length = round(value), shot = shots[index], next = shots[index + 1];
    if (!shot || !Number.isFinite(value) || length < .2) throw Error('Each shot must be at least 0.2 seconds long.');
    const changed = shots.map(item => ({...item}));
    const delta = round(length - shot.duration);
    changed[index].duration = length;
    if (keepTotal && Math.abs(delta) > .001) {
      if (!next) throw Error('The final shot has no following shot to compensate. Turn off Keep total length to change the ending.');
      const nextLength = round(next.duration - delta);
      if (nextLength < .2) throw Error(`Shot ${index + 2} would be shorter than 0.2 seconds. Use a smaller change or turn off Keep total length.`);
      changed[index + 1].duration = nextLength;
      // Preserve continuous source playback when neighboring shots touch.
      if (shot.media_id === next.media_id && Math.abs(shot.source_start + shot.duration - next.source_start) < .05) {
        changed[index + 1].source_start = round(next.source_start + delta);
      }
    }
    for (const i of [index, ...(keepTotal && next ? [index + 1] : [])]) {
      const item = changed[i], sourceLength = clipDurations[item.media_id];
      if (!Number.isFinite(sourceLength) || item.source_start < 0 || item.source_start + item.duration > sourceLength + .001) {
        throw Error(`Shot ${i + 1} would exceed its source footage. Use a smaller change or adjust its source start.`);
      }
    }
    if (changed.reduce((sum, item) => sum + item.duration, 0) > 120.1) throw Error('Timeline is limited to 120 seconds.');
    return changed;
  }
  function snapOptions(project, index, keepTotal) {
    if (index === project.shots.length - 1) return [];
    const {start, end} = bounds(project.shots, index);
    const cues = project.musical_changes ? (project.musical_cues || []).map(cue => cue.at) : [];
    const beats = project.rhythm_source === 'regular_fallback' ? [] : (project.beat_times || []);
    return [...new Set([...beats, ...cues])].filter(at => {
      if (!Number.isFinite(at) || Math.abs(at - end) > 1.5 || at <= start) return false;
      try { changeDuration(project.shots, index, at - start, keepTotal, project.clip_durations || {}); return true; }
      catch { return false; }
    }).sort((a, b) => a - b);
  }
  globalThis.AuracutTiming = Object.freeze({round, formatTime, bounds, changeDuration, snapOptions});
})();
