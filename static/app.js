const $ = id => document.getElementById(id);
let project = null;
let footageAIAvailable = false;
const selectedFootage = new Set();
let activeShot = -1;
let previewMode = 'shot';
let cutIndex = -1;
let cutPlaying = false;
let cutTimer = null;
let undoTiming = null;
let projectDirty = false;
let projectBusy = false;
let pendingCaptionLanguage = null;
const studioIds = ['speech-start','edit-plan','accept-plan','smart-cuts','keep-words','apply-transcript','generate-captions','clear-captions','download-srt','render-preview','director-review','apply-director','convert-captions'];
const timing = AuracutTiming;
const state = message => { $('status').textContent = message; };
const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const cutLength = () => project ? project.shots.reduce((sum, shot) => sum + shot.duration, 0) : 0;
function markDirty() {
  projectDirty = true;
  $('project-save-state').textContent = 'Unsaved changes';
}
function setBusy(value) {
  projectBusy = value;
  for (const id of ['export-resolution', 'create-section-cut', 'upload-footage', 'library-files', 'index-footage', 'clear-footage', 'refresh-footage', 'analyze-beats', 'backup', 'restore', 'new-project', 'create', 'save', 'export', 'duplicate', 'apply-story', 'project-name', 'lyrics', 'snap-story', 'dynamic-pacing', 'musical-changes', 'timeline', 'keep-total', 'undo-timing']) {
    const element = $(id);
    if (id === 'timeline') element.inert = value;
    else element.disabled = value || (['save', 'export', 'duplicate', 'backup', 'analyze-beats'].includes(id) && !project) || (id === 'undo-timing' && !undoTiming) || (['index-footage', 'create-section-cut'].includes(id) && !footageAIAvailable);
  }
  $('footage-list').inert = value; $('footage-results').inert = value;
  studioBusy();
}
function installProject(data) {
  exitCut();
  const video = $('preview'), audio = $('preview-song');
  video.pause(); audio.pause();
  video.onloadedmetadata = null; video.ontimeupdate = null; video.onerror = null;
  video.removeAttribute('src'); video.dataset.mediaId = ''; video.load();
  video.style.display = 'none'; $('empty-preview').style.display = '';
  audio.currentTime = 0;
  project = data; projectDirty = false; undoTiming = null; activeShot = -1;
  $('project-name').value = project.name || project.song_name;
  $('lyrics').value = project.lyrics || '';
  $('song').value = ''; $('clips').value = '';
  $('song-status').textContent = `${project.song_name} (saved on NAS)`;
  $('clip-list').replaceChildren();
  const savedMedia = document.createElement('li'); savedMedia.textContent = 'Saved footage — no upload needed to edit this cut'; $('clip-list').append(savedMedia);
  $('snap-story').checked = project.snap_story === true;
  $('dynamic-pacing').checked = project.dynamic_pacing === true;
  $('musical-changes').checked = project.musical_changes === true;
  $('now-playing').textContent = 'Click a shot below to preview its source footage (without the song)';
  $('studio-preview').pause(); $('studio-preview').removeAttribute('src'); $('studio-preview').hidden=true;
  draw(); drawStudio(); history.replaceState(null, '', `/#${project.id}`);
}
async function refreshProjects() {
  try {
    const data = await api('/api/projects');
    const rows = data.projects.map(item => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `project-row${item.id === project?.id ? ' current' : ''}`;
      button.setAttribute('aria-label', `Open project ${item.name}`);
      if (item.id === project?.id) button.setAttribute('aria-current', 'true');
      const name = document.createElement('strong'); name.textContent = item.name;
      const details = document.createElement('span'); details.textContent = `${timing.formatTime(item.duration)} · ${item.shot_count} shots · ${item.selection_mode === 'ai_sections' ? 'AI sections' : item.selection_mode === 'ai' ? 'AI' : 'Standard'}`;
      button.append(name, details);
      button.addEventListener('click', async () => {
        if (projectBusy || item.id === project?.id) return;
        if (projectDirty) { state('Save or duplicate your unsaved changes before opening another project.'); return; }
        setBusy(true);
        try { const loaded = await api(`/api/projects/${item.id}`); installProject(loaded); await refreshProjects(); state('Saved project opened.'); }
        catch (error) { state(`Could not open project: ${error.message}`); }
        finally { setBusy(false); }
      });
      return button;
    });
    if (!rows.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'No saved projects yet. Create a first cut to start.'; rows.push(empty); }
    $('project-list').replaceChildren(...rows);
  } catch { $('project-list').textContent = 'Could not load saved projects. Use Refresh to retry.'; }
}
$('refresh-projects').addEventListener('click', refreshProjects);
$('new-project').addEventListener('click', async () => {
  if (projectBusy) return;
  if (projectDirty) { state('Save or duplicate your unsaved changes before starting a new project.'); return; }
  exitCut(); $('preview').pause(); $('preview-song').pause();
  $('preview').onloadedmetadata = null; $('preview').ontimeupdate = null; $('preview').onerror = null;
  $('preview').removeAttribute('src'); $('preview').dataset.mediaId = ''; $('preview').load();
  $('preview-song').removeAttribute('src'); $('preview-song').dataset.songId = ''; $('preview-song').load();
  $('preview').style.display = 'none'; $('empty-preview').style.display = '';
  $('empty-preview').querySelector('p').textContent = 'Add a song and footage to create your first cut';
  project = null; undoTiming = null; activeShot = -1; projectDirty = false;
  $('project-name').value = ''; $('lyrics').value = ''; $('song').value = ''; $('clips').value = '';
  $('song-status').textContent = 'No song selected'; updateList();
  $('project-title').textContent = 'Your timeline starts here'; $('project-song').textContent = ''; $('project-save-state').textContent = '';
  $('story-panel').hidden = true; $('timeline').replaceChildren(); $('shot-count').textContent = '0 shots'; $('total-time').textContent = '00:00';
  $('play-cut').disabled = true; $('seek-cut').disabled = true; $('seek-cut').max = 0; updateCutClock(0);
  $('snap-story').checked = true; $('dynamic-pacing').checked = false; $('musical-changes').checked = false; drawStudio(); $('studio-preview').pause(); $('studio-preview').hidden=true; setBusy(false);
  history.replaceState(null, '', location.pathname); await refreshProjects(); state('Choose material for a new project.');
});
$('project-name').addEventListener('input', () => {
  if (!project) return;
  project.name = $('project-name').value.trim() || project.song_name;
  $('project-title').textContent = project.name; markDirty();
});
function shotAt(second) {
  let start = 0;
  for (let i = 0; i < project.shots.length; i++) {
    const end = start + project.shots[i].duration;
    if (second < end || i === project.shots.length - 1) return {index: i, offset: Math.max(0, second - start)};
    start = end;
  }
}
function pauseCut() {
  cutPlaying = false;
  $('preview-song').pause(); $('preview').pause();
  clearInterval(cutTimer); cutTimer = null;
  $('play-cut').textContent = '▶ Play full cut';
}
function exitCut() {
  if (previewMode !== 'cut') return;
  pauseCut(); previewMode = 'shot'; cutIndex = -1;
  $('preview').controls = true;
  $('preview').onloadedmetadata = null; $('preview').ontimeupdate = null; $('preview').onerror = null;
}
function updateCutClock(second) {
  const total = cutLength();
  $('seek-cut').value = Math.min(second, total);
  $('cut-clock').textContent = `${time(Math.min(second, total))} / ${time(total)}`;
}
function syncCut() {
  if (previewMode !== 'cut' || !project?.shots.length) return;
  const audio = $('preview-song'), video = $('preview');
  const position = Math.min(audio.currentTime || 0, cutLength());
  updateCutClock(position);
  if (position >= cutLength() - .02) { pauseCut(); return; }
  const {index, offset} = shotAt(position), shot = project.shots[index];
  const target = Math.min(shot.source_start + offset, shot.source_start + shot.duration - .04);
  if (cutIndex !== index) {
    cutIndex = index; activeShot = index;
    $('timeline').querySelectorAll('.shot').forEach((card, i) => card.classList.toggle('active', i === index));
    $('now-playing').textContent = `Full cut • Shot ${index + 1}: ${shot.name}`;
    if (video.dataset.mediaId !== shot.media_id) {
      video.pause();
      video.onloadedmetadata = () => {
        if (previewMode === 'cut') {
          const current = shotAt(Math.min(audio.currentTime, cutLength() - .05));
          if (current.index === cutIndex) video.currentTime = Math.min(shot.source_start + current.offset, shot.source_start + shot.duration - .04);
          if (cutPlaying) video.play().catch(() => state('Browser could not play this source clip in the full preview.'));
        }
      };
      video.dataset.mediaId = shot.media_id;
      video.src = `/media/${shot.media_id}`;
      video.load();
      return;
    }
  }
  if (video.readyState >= 1 && !video.seeking && Math.abs(video.currentTime - target) > .3) video.currentTime = target;
  if (cutPlaying && video.readyState >= 2 && video.paused) video.play().catch(() => state('Browser could not play this source clip in the full preview.'));
}
function enterCut() {
  if (previewMode === 'cut') return;
  $('preview').pause(); $('preview').onloadedmetadata = null; $('preview').ontimeupdate = null;
  $('preview').onerror = () => { pauseCut(); state('Browser could not load a source clip. Export MP4 to check the finished video.'); };
  $('preview').controls = false;
  $('preview').style.display = 'block'; $('empty-preview').style.display = 'none';
  previewMode = 'cut'; cutIndex = -1;
  syncCut();
}
$('play-cut').addEventListener('click', () => {
  if (!project) return;
  if (previewMode === 'cut' && cutPlaying) { pauseCut(); return; }
  enterCut();
  const audio = $('preview-song');
  if (audio.currentTime >= cutLength() - .05) audio.currentTime = 0;
  cutPlaying = true;
  $('play-cut').textContent = '❚❚ Pause full cut';
  audio.play().then(() => {
    syncCut();
    clearInterval(cutTimer); cutTimer = setInterval(syncCut, 100);
  }).catch(() => { pauseCut(); state('Browser could not play the song. Check that it supports this audio format.'); });
});
$('seek-cut').addEventListener('input', event => {
  if (!project) return;
  enterCut();
  const audio = $('preview-song'), target = Number(event.target.value);
  if (audio.readyState >= 1) audio.currentTime = target;
  else audio.addEventListener('loadedmetadata', () => { audio.currentTime = target; syncCut(); }, {once: true});
  syncCut();
});
$('preview-song').addEventListener('ended', pauseCut);
async function api(url, options = {}) {
  if (options.method === 'POST') options.headers = {...options.headers, 'X-Auracut-Request': '1'};
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
}
async function upload(file) {
  return api(`/api/media?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: file });
}
function updateList() {
  const files = [...$('clips').files];
  $('clip-list').replaceChildren();
  if (!files.length) { const li = document.createElement('li'); li.textContent = 'No clips selected'; $('clip-list').append(li); }
  for (const file of files) { const li = document.createElement('li'); li.textContent = file.name; $('clip-list').append(li); }
}
$('clips').addEventListener('change', updateList);
$('song').addEventListener('change', () => { $('song-status').textContent = $('song').files[0]?.name || 'No song selected'; });
api('/api/capabilities').then(config => {
  $('account-identity').textContent = `Signed in as ${config.user?.username || 'auracut'} · private workspace`;
  $('account-admin').hidden = config.user?.role !== 'admin';
  if (config.user?.role === 'admin') refreshAccounts();
  footageAIAvailable = config.ai_available;
  $('index-footage').disabled = projectBusy || !footageAIAvailable;
  $('create-section-cut').disabled = projectBusy || !footageAIAvailable;
  $('index-notice').textContent = footageAIAvailable ? 'Indexing sends up to 24 sampled frames per clip to OpenAI in one paid request. Full videos stay on the NAS. Choose 1–4 clips per batch; cached descriptions are reused.' : 'Visual indexing needs the NAS AI key. Filename search and footage upload still work.';
  $('use-ai').disabled = !config.ai_available;
  studioBusy();
  $('ai-notice').textContent = config.ai_available
    ? 'Optional: sends two sampled frames per clip and your lyrics or story notes to OpenAI. Full videos and song stay on your NAS. API usage may incur charges; maximum 8 clips.'
    : 'AI is off. Configure an API key on the NAS to enable optional visual selection.';
}).catch(() => { $('ai-notice').textContent = 'Could not check AI availability; standard cutting is still available.'; });
function shotCard(shot, index) {
  const card = document.createElement('article');
  card.className = `shot${index === activeShot ? ' active' : ''}`;
  card.tabIndex = 0;
  card.setAttribute('aria-label', `Preview shot ${index + 1}: ${shot.name}`);
  card.addEventListener('click', event => { if (!event.target.closest('button, input, select')) preview(index); });
  card.addEventListener('keydown', event => {
    if (event.target === card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); preview(index);
    }
  });
  const number = document.createElement('div'); number.className = 'shot-number'; number.textContent = `SHOT ${String(index + 1).padStart(2, '0')}`;
  const name = document.createElement('div'); name.className = 'shot-name'; name.textContent = shot.name; name.title = shot.name;
  const reason = document.createElement('div'); reason.className = 'shot-reason'; reason.textContent = shot.reason;
  const story = document.createElement('div'); story.className = 'shot-story'; story.textContent = shot.story_note ? `Story: ${shot.story_note}` : '';
  const span = timing.bounds(project.shots, index);
  const placement = document.createElement('div'); placement.className = 'shot-placement'; placement.textContent = `${timing.formatTime(span.start)} → ${timing.formatTime(span.end)}`;
  const settings = document.createElement('div'); settings.className = 'shot-settings';
  for (const [label, key] of [['Start (s)', 'source_start'], ['Length (s)', 'duration']]) {
    const field = document.createElement('label'); field.textContent = label;
    const input = document.createElement('input'); input.type = 'number'; input.min = key === 'duration' ? '.2' : '0'; input.step = '.1'; input.value = shot[key];
    input.addEventListener('change', () => editTiming(index, key, Number(input.value)));
    field.append(input); settings.append(field);
  }
  const actions = document.createElement('div'); actions.className = 'shot-actions';
  const add = (title, label, action, disabled) => { const button = document.createElement('button'); button.title = title; button.setAttribute('aria-label', `${title} shot ${index + 1}`); button.textContent = label; button.disabled = disabled; button.addEventListener('click', action); actions.append(button); };
  add('Preview', '▶', () => preview(index), false);
  add('Move left', '←', () => move(index, -1), index === 0);
  add('Move right', '→', () => move(index, 1), index === project.shots.length - 1);
  add('Remove', '×', () => { if (project.shots.length > 1) { exitCut(); undoTiming = null; project.shots.splice(index, 1); activeShot = -1; markDirty(); draw(); } }, project.shots.length === 1);
  const snapping = document.createElement('div'); snapping.className = 'shot-snap';
  const options = timing.snapOptions(project, index, $('keep-total').checked);
  const choice = document.createElement('select'); choice.setAttribute('aria-label', `End timing for shot ${index + 1}`);
  for (const at of options) {
    const option = document.createElement('option'); option.value = at;
    const delta = timing.round(at - span.end);
    const tonalCue = project.musical_changes && (project.musical_cues || []).some(cue => Math.abs(cue.at - at) < .001);
    option.textContent = `${timing.formatTime(at)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)}s)${tonalCue ? ' · tonal cue' : ''}`;
    choice.append(option);
  }
  if (options.length) choice.value = options.reduce((best, at) => Math.abs(at - span.end) < Math.abs(best - span.end) ? at : best);
  else { const option = document.createElement('option'); option.textContent = index === project.shots.length - 1 ? 'Final shot' : 'No valid nearby point'; choice.append(option); }
  choice.disabled = !options.length;
  const snap = document.createElement('button'); snap.type = 'button'; snap.className = 'quiet'; snap.textContent = 'Snap end'; snap.disabled = !options.length;
  snap.addEventListener('click', () => editTiming(index, 'duration', Number(choice.value) - span.start, true));
  snapping.append(choice, snap);
  card.append(number, name, reason, story, placement, settings, actions, snapping);
  return card;
}
function move(index, delta) { exitCut(); undoTiming = null; [project.shots[index], project.shots[index + delta]] = [project.shots[index + delta], project.shots[index]]; activeShot = -1; markDirty(); draw(); }
function editTiming(index, key, value, snapped = false) {
  try {
    if (snapped && key === 'duration' && Math.abs(timing.round(value) - project.shots[index].duration) < .001) {
      state('No timing change: this shot already ends at the selected suggestion. Choose an earlier or later time in the dropdown to try a different transition.');
      return;
    }
    let shots;
    if (key === 'duration') shots = timing.changeDuration(project.shots, index, value, $('keep-total').checked, project.clip_durations || {});
    else {
      shots = project.shots.map(shot => ({...shot}));
      const shot = shots[index];
      const sourceLength = project.clip_durations?.[shot.media_id];
      if (!Number.isFinite(value) || !Number.isFinite(sourceLength) || value < 0 || value + shot.duration > sourceLength + .001) throw Error('Source start would exceed the clip.');
      shot.source_start = timing.round(value);
    }
    undoTiming = project.shots.map(shot => ({...shot}));
    exitCut(); $('preview').pause(); $('preview').onloadedmetadata = null; $('preview').ontimeupdate = null;
    shots[index].reason = snapped ? 'End manually snapped to a saved audio timing point' : 'Manual timing adjustment';
    project.shots = shots; project.duration = timing.round(cutLength());
    activeShot = -1; markDirty(); draw();
    state(snapped ? `Shot ${index + 1} ends at ${timing.formatTime(timing.bounds(shots, index).end)}. Play the full cut to check it.` : 'Timing changed. Play the full cut to check the transition.');
  } catch (error) { draw(); state(error.message); }
}
$('keep-total').addEventListener('change', () => { if (project) draw(); });
$('undo-timing').addEventListener('click', () => {
  if (!project || !undoTiming) return;
  exitCut(); $('preview').pause(); project.shots = undoTiming; undoTiming = null;
  project.duration = timing.round(cutLength()); activeShot = -1; markDirty(); draw(); state('Last timing edit undone.');
});
function refreshStats() { $('shot-count').textContent = `${project.shots.length} shots`; $('total-time').textContent = timing.formatTime(cutLength()); }
function draw() {
  let at = 0;
  for (const shot of project.shots) {
    shot.story_note = [...(project.story_beats || [])].reverse().find(beat => beat.at <= at + .001)?.note || '';
    at = timing.round(at + shot.duration);
  }
  $('timeline').replaceChildren(...project.shots.map(shotCard));
  $('undo-timing').disabled = !undoTiming;
  $('timing-notice').textContent = project.rhythm_source === 'beat_grid'
    ? `Estimated rhythm: ${project.tempo_bpm ? project.tempo_bpm + ' BPM · ' : ''}${project.rhythm_method === 'percussion_spectral' ? 'percussion-based ' : ''}beat grid. Snap end offers nearby beats. Listen to check the feel; this does not identify bar starts or downbeats.`
    : project.rhythm_source === 'regular_fallback'
      ? 'No reliable rhythm or clear audio peaks were found. This cut uses regular timing; Snap end is unavailable.'
      : project.rhythm_source === 'audio_onsets'
        ? project.rhythm_method === 'percussion_spectral' ? 'Percussion onset timing: no reliable steady beat grid was found. Snap suggestions are sound attacks; check them by ear.' : 'Audio-peak timing: Snap end offers strong audio changes. Analyze beats to check for a steady rhythm.'
        : 'This older cut has saved timing points. Analyze beats to refresh suggestions without moving your shots.';
  if (project.musical_changes) $('timing-notice').textContent += ` Musical-change preference enabled · ${(project.musical_cues || []).length} estimated tonal cues. These are not confirmed chord or phrase boundaries.`;
  const editableStory = ['ai', 'ai_sections'].includes(project.selection_mode) && project.clip_ids?.length && project.clip_descriptions && Object.keys(project.clip_descriptions).length;
  $('story-panel').hidden = !editableStory;
  $('story-markers').textContent = (project.story_beats || []).map(beat => `${timing.formatTime(beat.at)} ${beat.note}${beat.requested_at !== undefined && beat.at !== beat.requested_at ? ` (from ${timing.formatTime(beat.requested_at)})` : ''}`).join(' · ') || 'Add timed notes above to guide each scene.';
  if (activeShot < 0) $('empty-preview').querySelector('p').textContent = 'Click a shot below to preview its source footage';
  $('project-title').textContent = project.name || project.song_name;
  $('project-song').textContent = project.song_name;
  $('project-save-state').textContent = projectDirty ? 'Unsaved changes' : 'Saved on NAS';
  $('save').disabled = projectBusy; $('export').disabled = projectBusy; $('duplicate').disabled = projectBusy;
  $('play-cut').disabled = false; $('seek-cut').disabled = false;
  $('seek-cut').max = cutLength();
  const audio = $('preview-song');
  if (audio.dataset.songId !== project.song_id) {
    audio.dataset.songId = project.song_id;
    audio.src = `/media/${project.song_id}`; audio.load();
  }
  refreshStats();
  updateCutClock(audio.currentTime || 0);
  setBusy(projectBusy);
}
$('apply-story').addEventListener('click', async () => {
  if (!project || projectBusy) return;
  setBusy(true);
  try {
    state('Updating timed story and AI suggestions…');
    const job = await api(`/api/projects/${project.id}/story`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({lyrics: $('lyrics').value, snap_story: $('snap-story').checked, dynamic_pacing: $('dynamic-pacing').checked, musical_changes: $('musical-changes').checked, name: project.name}) });
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const result = await api(`/api/jobs/${job.job_id}`);
      if (result.state === 'error') throw Error(result.message);
      if (result.state === 'done') { project = await api(`/api/projects/${result.project_id}`); break; }
    }
    installProject(project); await refreshProjects(); state('AI suggestions updated. Review the new timeline before export.');
  } catch (error) { state(`Could not update story: ${error.message}`); }
  finally { setBusy(false); }
});
function preview(index) {
  exitCut();
  activeShot = index;
  const shot = project.shots[index], video = $('preview');
  video.style.display = 'block'; $('empty-preview').style.display = 'none';
  video.onerror = () => state('Could not load this source clip for preview. The exported MP4 may still play.');
  video.onloadedmetadata = () => {
    video.currentTime = shot.source_start;
    video.play().catch(() => state('Shot selected. Press play in the preview to watch it.'));
  };
  video.ontimeupdate = () => { if (video.currentTime >= shot.source_start + shot.duration) video.pause(); };
  video.dataset.mediaId = shot.media_id;
  video.src = `/media/${shot.media_id}`;
  video.load();
  $('now-playing').textContent = `Shot ${index + 1}: ${shot.name} (source ${time(shot.source_start)})`;
  $('timeline').querySelectorAll('.shot').forEach((card, i) => card.classList.toggle('active', i === index));
}
$('create').addEventListener('click', async () => {
  if (projectBusy) return;
  if (projectDirty) { state('Save or duplicate your unsaved changes before creating another project.'); return; }
  const song = $('song').files[0], clips = [...$('clips').files];
  const savedClipIds = [...selectedFootage];
  const count = clips.length || savedClipIds.length;
  if (!song || !count) { state('Choose a song and footage files, or select saved clips in Search footage.'); return; }
  if (count > 30 || ($('use-ai').checked && count > 8)) { state('Use up to 8 clips for an AI first cut, or up to 30 for a standard cut.'); return; }
  setBusy(true);
  try {
    state('Uploading song…'); const audio = await upload(song);
    const ids = clips.length ? [] : savedClipIds;
    for (let i = 0; i < clips.length; i++) { state(`Uploading clip ${i + 1} of ${clips.length}…`); ids.push((await upload(clips[i])).id); }
    state($('use-ai').checked ? 'Analyzing sampled clip frames and assembling shots…' : 'Analyzing rhythm and assembling shots…');
    const created = await api('/api/projects', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({song_id: audio.id, clip_ids: ids, lyrics: $('lyrics').value, duration: Number($('duration').value), use_ai: $('use-ai').checked, snap_story: $('snap-story').checked, dynamic_pacing: $('dynamic-pacing').checked, musical_changes: $('musical-changes').checked, name: $('project-name').value}) });
    if (created.job_id) {
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const result = await api(`/api/jobs/${created.job_id}`);
        if (result.state === 'error') throw Error(result.message);
        if (result.state === 'done') { project = await api(`/api/projects/${result.project_id}`); break; }
      }
    } else project = created;
    installProject(project); await refreshProjects(); await refreshFootage(); state(project.draft_pending ? 'Proposed cut ready. Open AI editing studio to review and accept the plan before export.' : 'First cut ready. Click a shot to preview its source footage.');
  } catch (error) { state(`Could not create first cut: ${error.message}`); }
  finally { setBusy(false); }
});
async function save() {
  exitCut();
  if (project.selection_mode === 'speech' && !$('transcript-panel').hidden) rememberTranscriptSelection();
  const reviewedKeep = project.transcript_keep;
  project = await api(`/api/projects/${project.id}/save`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(project) });
  if (Array.isArray(reviewedKeep)) project.transcript_keep = reviewedKeep;
  projectDirty = false; draw(); drawStudio(); await refreshProjects(); state('Timeline saved.');
}
$('save').addEventListener('click', async () => { if (projectBusy) return; setBusy(true); try { await save(); } catch (error) { state(`Could not save: ${error.message}`); } finally { setBusy(false); } });
$('duplicate').addEventListener('click', async () => {
  if (!project || projectBusy) return;
  setBusy(true);
  try {
    const copy = await api(`/api/projects/${project.id}/duplicate`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(project)});
    installProject(copy); await refreshProjects(); state('Project duplicated. Your current edits are saved in this copy.');
  } catch (error) { state(`Could not duplicate: ${error.message}`); }
  finally { setBusy(false); }
});
$('analyze-beats').addEventListener('click', async () => {
  if (!project || projectBusy) return;
  setBusy(true); state('Analyzing song rhythm locally…');
  try {
    const updated = await api(`/api/projects/${project.id}/rhythm`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(project)});
    installProject(updated); await refreshProjects();
    state(updated.rhythm_source === 'beat_grid'
      ? `Beat suggestions refreshed at approximately ${updated.tempo_bpm} BPM. Your current edits were saved and shot boundaries kept. Try Snap end on a transition.`
      : 'Rhythm analysis completed using a fallback. Your current edits were saved and shot boundaries kept; see the timing note above.');
  } catch (error) { state(`Beat analysis failed: ${error.message}`); }
  finally { setBusy(false); }
});
$('backup').addEventListener('click', async () => {
  if (!project || projectBusy) return;
  setBusy(true);
  try {
    await save();
    const link = document.createElement('a');
    link.href = `/api/projects/${project.id}/backup`;
    link.download = 'auracut-project.zip'; link.target = '_blank'; link.rel = 'noopener';
    link.click();
    state('Backup requested. Keep the downloaded ZIP somewhere separate from the NAS. Projects over 1 GB need a NAS data-folder backup.');
  } catch (error) { state(`Backup failed: ${error.message}`); }
  finally { setBusy(false); }
});
$('restore').addEventListener('click', () => {
  if (projectBusy) return;
  if (projectDirty) { state('Save or duplicate your unsaved changes before restoring a project.'); return; }
  $('restore-file').click();
});
$('restore-file').addEventListener('change', async () => {
  const file = $('restore-file').files[0];
  $('restore-file').value = '';
  if (!file || projectBusy) return;
  if (projectDirty) { state('Save or duplicate your unsaved changes before restoring a project.'); return; }
  if (!file.name.toLowerCase().endsWith('.zip') || file.size > 1024 ** 3) { state('Choose an Auracut project ZIP under 1 GB.'); return; }
  setBusy(true); state('Uploading and checking the project backup…');
  try {
    const restored = await api('/api/projects/restore', {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: file});
    installProject(restored); await refreshProjects(); state('Backup restored as a separate project. Select a shot or play the full cut to review it.');
  } catch (error) { state(`Restore failed: ${error.message}`); }
  finally { setBusy(false); }
});
$('export').addEventListener('click', async () => {
  if (projectBusy) return;
  setBusy(true);
  try {
    const resolution = $('export-resolution').value;
    await save(); state(`Rendering ${resolution === '4k' ? '4K' : resolution} MP4…`);
    const job = await api(`/api/projects/${project.id}/export`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...project, export_resolution: resolution}) });
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const result = await api(`/api/jobs/${job.job_id}`);
      if (result.state === 'error') throw Error(result.message);
      if (result.state === 'done') { state('Export ready. Download starting…'); const link = document.createElement('a'); link.href = result.url; link.download = 'auracut-export.mp4'; link.click(); break; }
    }
  } catch (error) { state(`Export failed: ${error.message}`); }
  finally { setBusy(false); }
});
const savedId = location.hash.slice(1);
if (/^[a-f0-9]{32}$/.test(savedId)) {
  setBusy(true);
  api(`/api/projects/${savedId}`).then(async data => { installProject(data); await refreshProjects(); state('Saved timeline loaded.'); }).catch(() => state('Saved project could not be loaded.')).finally(() => setBusy(false));
} else refreshProjects();

async function refreshFootage() {
  const data = await api('/api/footage');
  const rows = data.media.map(item => {
    const row = document.createElement('label'); row.className = 'footage-item';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selectedFootage.has(item.id);
    checkbox.addEventListener('change', () => { if (checkbox.checked) selectedFootage.add(item.id); else selectedFootage.delete(item.id); });
    const text = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = item.name;
    const detail = document.createElement('small'); detail.textContent = `${time(item.duration)} · ${item.sections ? item.sections + ' searchable sections' : 'Filename search only'}`;
    text.append(name, detail); row.append(checkbox, text); return row;
  });
  const available = new Set(data.media.map(item => item.id));
  for (const id of selectedFootage) if (!available.has(id)) selectedFootage.delete(id);
  $('footage-list').replaceChildren(...rows);
  if (!rows.length) $('footage-list').textContent = 'Upload footage here, or create a first cut using the inputs on the left.';
}
function previewSection(result) {
  if (projectBusy) return;
  exitCut();
  const video = $('preview'); video.pause();
  video.onloadedmetadata = () => { video.currentTime = result.start; video.play().catch(() => state('Press play to preview this source section.')); };
  video.ontimeupdate = () => { if (video.currentTime >= result.end) video.pause(); };
  video.onerror = () => state('Browser cannot preview this footage codec.');
  video.controls = true; video.style.display = 'block'; $('empty-preview').style.display = 'none';
  video.dataset.mediaId = result.media_id; video.src = `/media/${result.media_id}`; video.load();
  $('now-playing').textContent = `Footage search: ${result.name} · ${timing.formatTime(result.start)}–${timing.formatTime(result.end)} (muted source)`;
}
async function useSection(result, mode) {
  if (!project || projectBusy) { state('Open or create a project before adding footage.'); return; }
  if (mode === 'replace' && activeShot < 0) { state('Select a shot in the timeline, then click Replace selected shot on the search result.'); return; }
  setBusy(true);
  try {
    const updated = await api(`/api/projects/${project.id}/section`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({project, media_id: result.media_id, section_id: result.id, mode, shot_index: activeShot})});
    installProject(updated); await refreshProjects();
    state(mode === 'replace' ? 'Selected shot replaced and timeline saved. Duration is unchanged; play the cut to review it.' : 'Footage section appended and timeline saved. Play the cut to review it.');
  } catch (error) { state(`Could not use footage section: ${error.message}`); }
  finally { setBusy(false); }
}
async function searchFootage() {
  const query = $('footage-query').value.trim();
  const data = await api(`/api/footage/search?q=${encodeURIComponent(query)}`);
  // Ignore an older response if the query changed while it was in flight.
  if ($('footage-query').value.trim() !== query) return;
  const rows = data.results.map(result => {
    const row = document.createElement('article'); row.className = 'footage-result';
    const name = document.createElement('strong'); name.textContent = result.name;
    const span = document.createElement('small'); span.textContent = `${timing.formatTime(result.start)}–${timing.formatTime(result.end)} · ${result.indexed ? 'sampled visual description' : 'not indexed'}`;
    const description = document.createElement('p'); description.textContent = result.description;
    const actions = document.createElement('div'); actions.className = 'footage-actions';
    for (const [label, action] of [['Preview section', () => previewSection(result)], ...(result.indexed ? [['Replace selected shot', () => useSection(result, 'replace')], ['Add to end', () => useSection(result, 'append')]] : [])]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = label; button.addEventListener('click', action); actions.append(button);
    }
    row.append(name, span, description, actions); return row;
  });
  $('footage-results').replaceChildren(...rows);
  $('footage-search-status').textContent = rows.length ? `${rows.length} sections shown${rows.length === 100 ? ' (limit 100; refine your keywords)' : ''}. Preview the section to find the precise moment.` : 'No matches. Try a filename or keywords used in the visual descriptions. Index clips to search their content.';
}
$('refresh-footage').addEventListener('click', async () => {
  try { await refreshFootage(); await searchFootage(); } catch (error) { state(`Could not load footage: ${error.message}`); }
});
$('search-footage').addEventListener('click', async () => { try { await searchFootage(); } catch (error) { state(`Search failed: ${error.message}`); } });
$('footage-query').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('search-footage').click(); } });
$('upload-footage').addEventListener('click', async () => {
  const files = [...$('library-files').files];
  if (projectBusy || !files.length) { state('Choose footage files to upload.'); return; }
  if (files.length > 20) { state('Upload up to 20 footage files per batch.'); return; }
  setBusy(true);
  try {
    for (let i = 0; i < files.length; i++) { state(`Uploading footage ${i + 1} of ${files.length}…`); selectedFootage.add((await upload(files[i])).id); }
    $('library-files').value = ''; await refreshFootage(); await searchFootage(); state('Footage uploaded. Select up to four clips and choose Index selected (AI) to search visual descriptions.');
  } catch (error) { await refreshFootage().catch(() => {}); state(`Footage upload failed: ${error.message}. Any completed uploads remain available.`); }
  finally { setBusy(false); }
});
$('index-footage').addEventListener('click', async () => {
  if (projectBusy) return;
  const ids = [...selectedFootage];
  if (!ids.length || ids.length > 4) { state('Choose 1–4 footage clips for this indexing batch.'); return; }
  setBusy(true); state('Indexing sampled footage sections…');
  try {
    const job = await api('/api/footage/index', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({media_ids: ids})});
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const status = await api(`/api/jobs/${job.job_id}`);
      if (status.state === 'error') throw Error(status.message);
      if (status.state === 'done') break;
      state(`Indexing footage: ${status.completed || 0} of ${status.total || ids.length} clips complete…`);
    }
    await refreshFootage(); await searchFootage(); state('Footage index ready. Search keywords, preview a section, then replace a selected shot or add it to the end.');
  } catch (error) { await refreshFootage().catch(() => {}); state(`Indexing failed: ${error.message}. Completed indexes are cached; retrying skips them.`); }
  finally { setBusy(false); }
});
refreshFootage().then(searchFootage).catch(() => { $('footage-list').textContent = 'Could not load footage. Use Refresh.'; });

$('clear-footage').addEventListener('click', async () => { selectedFootage.clear(); try { await refreshFootage(); } catch (error) { state(error.message); } });

$('create-section-cut').addEventListener('click', async () => {
  if (projectBusy) return;
  if (projectDirty) { state('Save or duplicate unsaved changes before creating a section cut.'); return; }
  const ids = [...selectedFootage], songFile = $('song').files[0];
  if (!ids.length || ids.length > 20) { state('Select 1–20 indexed clips in the footage library. Index them in batches of up to four first.'); return; }
  if (!songFile && !project) { state('Choose a song file, or open a saved project to reuse its song.'); return; }
  setBusy(true);
  try {
    const library = await api('/api/footage');
    const selected = ids.map(id => library.media.find(item => item.id === id));
    if (selected.some(item => !item || !item.sections)) throw Error('Every selected clip must be indexed first. No AI selection request was sent.');
    let songId = project?.song_id;
    if (songFile) { state('Uploading the song…'); songId = (await upload(songFile)).id; }
    const title = ($('project-name').value.trim() || project?.name || songFile?.name || 'New cut').slice(0, 108) + ' section cut';
    state('Choosing indexed sections and assembling a new cut…');
    const job = await api('/api/projects/from-sections', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({song_id: songId, clip_ids: ids, lyrics: $('lyrics').value, duration: Number($('duration').value), snap_story: $('snap-story').checked, dynamic_pacing: $('dynamic-pacing').checked, musical_changes: $('musical-changes').checked, name: title})});
    let created;
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const status = await api(`/api/jobs/${job.job_id}`);
      if (status.state === 'error') throw Error(status.message);
      if (status.state === 'done') { created = await api(`/api/projects/${status.project_id}`); break; }
    }
    installProject(created); await refreshProjects();
    state('Proposed section cut ready. Review AI editing plan in the studio and accept before export. Your previous project is kept.');
  } catch (error) { state(`Could not create section cut: ${error.message}`); }
  finally { setBusy(false); }
});

// Explicit AI proposals and speech/caption review. Text is never interpreted as HTML.
function studioBusy() {
  for (const id of studioIds) $(id).disabled = projectBusy || (id !== 'speech-start' && !project) || (['speech-start','edit-plan','smart-cuts','director-review'].includes(id) && !footageAIAvailable);
  $('transcript-words').inert = projectBusy; $('caption-editor').inert = projectBusy;
  $('remove-pauses').disabled = projectBusy;
  $('caption-language').disabled = projectBusy || !project?.captions?.length;
  $('convert-captions').disabled = projectBusy || !project?.captions?.length || ($('caption-language').value !== 'original' && !footageAIAvailable);
  $('normalize-speech').disabled = projectBusy || !project?.source_audio;
  $('accept-plan').disabled = projectBusy || !project?.editing_plan;
  $('apply-director').disabled = projectBusy || !project?.director_review?.changes?.length;
  if (project?.draft_pending) $('export').disabled = true;
  if (project?.source_audio) { $('play-cut').disabled = true; $('seek-cut').disabled = true; }
}
function studioReport(target, report, rows = false) {
  target.replaceChildren();
  if (!report) return;
  const summary = document.createElement('p'); summary.textContent = report.summary || ''; target.append(summary);
  for (const text of [...(report.story_order || []), ...(report.warnings || []), ...(report.issues || [])]) { const p = document.createElement('p'); p.textContent = '• ' + text; target.append(p); }
  if (rows && report.rows?.length) {
    const table = document.createElement('table');
    for (const row of report.rows) { const tr = document.createElement('tr'); for (const value of [`Shot ${row.shot}`, `${timing.formatTime(row.start)} · ${row.duration}s`, row.footage, row.reason]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } table.append(tr); } target.append(table);
  }
  for (const change of report.changes || []) { const p = document.createElement('p'); p.textContent = `Proposed shot ${change.shot}: source ${change.source_start}s, duration ${change.duration}s — ${change.reason}`; target.append(p); }
}
function rememberTranscriptSelection() {
  if (!project) return;
  project.transcript_keep = [...document.querySelectorAll('#transcript-words input:checked')].map(input => Number(input.dataset.wordIndex));
  markDirty();
}
function drawStudio() {
  $('caption-language').value = pendingCaptionLanguage || project?.caption_language || 'original';
  $('speech-volume-control').hidden = !project?.source_audio;
  $('normalize-speech').checked = project?.normalize_speech === true;
  const words = project?.selection_mode === 'speech' ? project.transcripts?.[project.clip_ids[0]] || [] : [];
  $('transcript-panel').hidden = !words.length;
  $('transcript-words').replaceChildren();
  words.forEach((word,index) => {
    const label = document.createElement('label'), input = document.createElement('input'); input.type='checkbox'; input.checked=!Array.isArray(project.transcript_keep) || project.transcript_keep.includes(index); input.dataset.wordIndex=index;
    input.addEventListener('change', rememberTranscriptSelection);
    label.title=`${word.start.toFixed(2)}–${word.end.toFixed(2)}s`;
    label.append(input, document.createTextNode(' '+word.word)); $('transcript-words').append(label);
  });
  $('caption-editor').replaceChildren();
  (project?.captions || []).forEach((cue,index) => {
    const label = document.createElement('label'), span = document.createElement('span'), text = document.createElement('textarea');
    span.textContent = `${timing.formatTime(cue.start)}–${timing.formatTime(cue.end)}`; text.value=cue.text; text.maxLength=140; text.setAttribute('aria-label',`Caption ${index+1}`);
    text.addEventListener('input',()=>{cue.text=text.value;markDirty();}); label.append(span,text); $('caption-editor').append(label);
  });
  studioReport($('plan-report'),project?.editing_plan,true); studioReport($('director-report'),project?.director_review);
  if (project?.draft_pending) { $('studio-panel').open=true; $('studio-status').textContent='Proposed cut: review the AI editing plan, revise the story brief if needed, then accept before export.'; }
  else if (project?.source_audio) $('studio-status').textContent='Speech project: use Render preview for synchronized source audio and captions. Transcript edits create separate copies.';
  else $('studio-status').textContent='';
  studioBusy();
}
async function studioCall(operation, extra = {}) {
  const started = await api('/api/studio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,project_id:project?.id,...extra})});
  while (true) {
    await new Promise(resolve=>setTimeout(resolve,1500));
    const job=await api(`/api/jobs/${started.job_id}`);
    if(job.state==='error') throw Error(job.message);
    if(job.state==='done') return job.result;
  }
}
async function runStudio(operation, extra = {}) {
  if (projectBusy) return;
  if (operation === 'caption-language') {
    pendingCaptionLanguage = extra.language;
    const label = $('caption-language').selectedOptions[0]?.textContent || extra.language;
    $('caption-language-status').textContent = `${label} conversion running… Current captions remain until conversion finishes.`;
  }
  setBusy(true);
  try {
    exitCut(); $('preview').pause(); $('preview-song').pause(); $('studio-preview').pause();
    if (project && operation !== 'speech') {
      await save();
      const reviewedKeep = project.transcript_keep;
      project=await api(`/api/projects/${project.id}`);
      if (Array.isArray(reviewedKeep)) project.transcript_keep = reviewedKeep;
      extra.fingerprint=project.editor_fingerprint;
    }
    state(`${operation.replaceAll('-',' ')} running…`);
    const result=await studioCall(operation,extra);
    if(result.project) { installProject(result.project); await refreshProjects(); }
    if(result.report) {
      const reviewedKeep = project.transcript_keep;
      project=await api(`/api/projects/${project.id}`);
      if (Array.isArray(reviewedKeep)) project.transcript_keep = reviewedKeep;
      drawStudio();
      $('studio-panel').open=true;
    }
    const url=result.preview_url || result.report?.preview_url;
    if(url) { $('studio-preview').src=url; $('studio-preview').hidden=false; $('studio-preview').load(); }
    if(operation==='smart') {
      const removed=new Set(result.remove);
      document.querySelectorAll('#transcript-words input').forEach(input=>input.checked=!removed.has(Number(input.dataset.wordIndex)));
      rememberTranscriptSelection();
      $('studio-status').textContent=`Suggested removals: ${removed.size} words. ${result.reason} Review the checkboxes before applying.`;
    }
    if (operation === 'caption-language') {
      const label = $('caption-language').selectedOptions[0]?.textContent || extra.language;
      $('caption-language-status').textContent = `${label} captions applied. Render a new preview or export to see them in the video.`;
    }
    state('Studio operation complete. Review the result before applying changes.');
    return result;
  } catch(error) {
    state(`Studio: ${error.message}`);
    if (operation === 'caption-language') $('caption-language-status').textContent = `Conversion failed: ${error.message}. Existing captions retained.`;
  }
  finally { pendingCaptionLanguage = null; setBusy(false); }
}
$('speech-start').addEventListener('click',async()=>{
  if(projectDirty) { state('Save your current project before starting a speech project.');return; }
  const ids=[...selectedFootage], files=[...$('clips').files];
  if(ids.length!==1 && files.length!==1) { state('Select one saved speech clip in Search footage, or choose one footage file on the left.');return; }
  let id=ids.length===1?ids[0]:null;
  if(!id) { setBusy(true);try {id=(await upload(files[0])).id;}catch(error){state(error.message);return;}finally{setBusy(false);} }
  await runStudio('speech',{media_id:id,name:$('project-name').value});
});
$('smart-cuts').addEventListener('click',()=>runStudio('smart'));
$('keep-words').addEventListener('click',()=>{document.querySelectorAll('#transcript-words input').forEach(input=>input.checked=true);rememberTranscriptSelection();});
$('apply-transcript').addEventListener('click',()=>{
  const keep=[...document.querySelectorAll('#transcript-words input:checked')].map(input=>Number(input.dataset.wordIndex));
  runStudio('transcript-apply',{keep,remove_pauses:$('remove-pauses').checked});
});
$('generate-captions').addEventListener('click',()=>runStudio('captions'));
$('edit-plan').addEventListener('click',()=>runStudio('plan',{brief:$('lyrics').value}));
$('accept-plan').addEventListener('click',()=>runStudio('accept-plan'));
$('director-review').addEventListener('click',()=>runStudio('director'));
$('apply-director').addEventListener('click',()=>runStudio('director-apply'));
$('render-preview').addEventListener('click',()=>runStudio('preview'));
$('download-srt').addEventListener('click',()=>{
  if(!project?.captions?.length) {state('Generate captions first.');return;}
  const stamp=t=>{const ms=Math.round(t*1000);const sec=Math.floor(ms/1000);return `${String(Math.floor(sec/3600)).padStart(2,'0')}:${String(Math.floor(sec/60)%60).padStart(2,'0')}:${String(sec%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
  const text=project.captions.map((cue,i)=>`${i+1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join('\n');
  const url=URL.createObjectURL(new Blob([text],{type:'application/x-subrip'}));const link=document.createElement('a');link.href=url;link.download='auracut-captions.srt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

$('caption-language').addEventListener('change',studioBusy);
$('convert-captions').addEventListener('click',()=>runStudio('caption-language',{language:$('caption-language').value}));
$('normalize-speech').addEventListener('change',()=>{if(project?.source_audio && !projectBusy){project.normalize_speech=$('normalize-speech').checked;markDirty();}});
$('clear-captions').addEventListener('click',()=>{if(project && !projectBusy){project.captions=[];markDirty();drawStudio();}});
drawStudio();

// Admin account operations never render passwords or password hashes.
async function refreshAccounts() {
  try {
    const result = await api('/api/accounts');
    $('account-list').replaceChildren();
    for (const account of result.accounts) {
      const row = document.createElement('div');
      const text = document.createElement('p');
      text.textContent = `${account.username} · ${account.role} · ${account.enabled ? 'enabled' : 'disabled'} · AI ${account.ai_allowed ? 'allowed' : 'off'}`;
      row.append(text);
      if (account.role !== 'admin') {
        for (const [label,changes] of [[account.enabled ? 'Disable account' : 'Enable account',{enabled:!account.enabled}],[account.ai_allowed ? 'Turn AI off' : 'Allow paid AI',{ai_allowed:!account.ai_allowed}]]) {
          const button=document.createElement('button');button.type='button';button.className='quiet';button.textContent=label;
          button.addEventListener('click',async()=>{button.disabled=true;try{await api('/api/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'update',username:account.username,...changes})});await refreshAccounts();$('account-status').textContent='Account updated.';}catch(error){$('account-status').textContent=error.message;}finally{button.disabled=false;}});row.append(button);
        }
        const reset=document.createElement('button');reset.type='button';reset.className='quiet';reset.textContent='Reset password';
        reset.addEventListener('click',()=>{$('account-operation').value='reset-password';$('account-username').value=account.username;$('account-password').value='';$('account-password').focus();$('account-status').textContent='Enter a new password above, then Save account.';});row.append(reset);
      }
      $('account-list').append(row);
    }
  } catch(error) {$('account-status').textContent=error.message;}
}
$('account-submit').addEventListener('click',async()=>{
  const button=$('account-submit');button.disabled=true;
  const data={operation:$('account-operation').value,username:$('account-username').value.trim(),password:$('account-password').value,ai_allowed:$('account-ai').checked};
  try {await api('/api/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});$('account-password').value='';$('account-status').textContent='Account saved.';await refreshAccounts();}
  catch(error){$('account-status').textContent=error.message;}
  finally{data.password='';button.disabled=false;}
});
