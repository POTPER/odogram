export async function hydrateOfficialRoadmap(doc) {
  if (doc.roadmapSource !== 'github') {
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch('/api/official-roadmap');
    if (!res.ok) {
      return { ok: false, fallback: true };
    }

    const data = await res.json();
    if (!data.enabled || data.milestones == null || !data.milestones.length) {
      return { ok: false, fallback: true, error: data.error };
    }

    doc.views.roadmap.milestones = data.milestones;
    doc.roadmapMeta = {
      synced: true,
      projectUrl: data.projectUrl || '',
      projectTitle: data.projectTitle || '',
    };

    return { ok: true };
  } catch (err) {
    console.warn('Official roadmap fetch failed:', err);
    return { ok: false, fallback: true };
  }
}
