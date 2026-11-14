import type { Row } from './cardfile';

function ecgAF(): string {
  const W = 760, H = 200, base = 120;
  let grid = '';
  for (let x = 0; x <= W; x += 10) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#f3c7c7" stroke-width="${x % 50 ? 0.5 : 1.2}"/>`;
  for (let y = 0; y <= H; y += 10) grid += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#f3c7c7" stroke-width="${y % 50 ? 0.5 : 1.2}"/>`;
  // irregularly irregular QRS, fibrillatory baseline, no P waves
  const beats = [60, 140, 190, 300, 350, 470, 560, 600, 700];
  let d = `M0 ${base}`;
  let x = 0;
  const rnd = (i: number) => Math.sin(i * 12.9898) * 43758.5453 % 1;
  for (const b of beats) {
    while (x < b - 8) { x += 4; d += ` L${x} ${(base + Math.sin(x * 0.9) * 2.5 + rnd(x) * 2).toFixed(1)}`; }
    d += ` L${b - 4} ${base + 4} L${b} ${base - 78} L${b + 5} ${base + 18} L${b + 10} ${base} L${b + 30} ${base - 8} L${b + 46} ${base}`;
    x = b + 46;
  }
  while (x < W) { x += 4; d += ` L${x} ${(base + Math.sin(x * 0.9) * 2.5).toFixed(1)}`; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff8f8"/>${grid}<path d="${d}" fill="none" stroke="#1b1b1b" stroke-width="2" stroke-linejoin="round"/><text x="8" y="20" font-family="sans-serif" font-size="14" fill="#555">Lead II</text></svg>`;
  return btoa(svg);
}

export const DEMO_MEDIA = [{ name: 'ecg-af.svg', mime: 'image/svg+xml', data: ecgAF() }];

export const DEMO_DECKS: { name: string; description: string; rows: Row[] }[] = [
  {
    name: 'أمراض القلب',
    description: 'Cardiology',
    rows: [
      { id: 'cardio-001', front: 'What is the most common cause of mitral stenosis worldwide?', back: '**Rheumatic heart disease**' },
      { id: 'cardio-002', front: 'Normal PR interval: {{c1::0.12–0.20 s}}.\nNormal QRS duration: {{c2::less than 0.12 s}}.' },
      { id: 'cardio-003', front: "Beck's triad of cardiac tamponade: {{c1::hypotension}}, {{c2::distended neck veins}}, and {{c3::muffled heart sounds}}." },
      { id: 'cardio-004', front: 'Identify the rhythm:\n![](ecg-af.svg)', back: '**Atrial fibrillation**\n- Irregularly irregular R–R intervals\n- No distinct P waves' },
      { id: 'cardio-005', front: 'ما العلاج الأولي لنوبة الذبحة الصدرية المستقرة؟', back: '**Sublingual nitroglycerin (GTN)**\nيوسّع الأوردة فيقلّل الحمل القبلي (preload) واستهلاك العضلة القلبية للأكسجين.' },
      { id: 'cardio-006', front: 'Which murmur is classically heard in aortic stenosis?', back: 'Ejection systolic (crescendo–decrescendo) murmur at the right 2nd intercostal space, radiating to the **carotids**.' },
      { id: 'cardio-007', front: 'The most common cause of death in the first 24 hours after MI is {{c1::ventricular fibrillation}}.' },
      { id: 'cardio-008', front: 'علامة {{c1::Kussmaul}} هي ارتفاع ضغط الوريد الوداجي أثناء الشهيق، وتُرى في {{c2::التهاب التامور العاصر::نوع من أمراض التامور}}.' },
    ],
  },
  {
    name: 'علم الأدوية',
    description: 'Pharmacology',
    rows: [
      { id: 'pharm-001', front: 'Antidote for heparin overdose?', back: '**Protamine sulfate**' },
      { id: 'pharm-002', front: 'Antidote for warfarin overdose?', back: '**Vitamin K**\nPlus prothrombin complex concentrate (or FFP) if there is major bleeding.' },
      { id: 'pharm-003', front: '{{c1::ACE inhibitors}} cause a dry cough because they block the breakdown of {{c2::bradykinin}}.' },
      { id: 'pharm-004', front: 'Antidote for paracetamol poisoning?', back: '**N-acetylcysteine (NAC)**' },
      { id: 'pharm-005', front: 'ما الأثر الجانبي المميز للأميودارون على الغدة الدرقية؟', back: 'قد يسبب **قصور** أو **فرط** نشاط الغدة الدرقية، لأنه غني باليود.' },
      { id: 'pharm-006', front: 'Digoxin toxicity: the classic visual symptom is {{c1::yellow-green vision}}, and it is made worse by {{c2::hypokalemia}}.' },
      { id: 'pharm-007', front: 'Mechanism of action of metformin?', back: 'Decreases hepatic gluconeogenesis and increases insulin sensitivity.\nMain serious risk: **lactic acidosis**.' },
    ],
  },
  {
    name: 'التشريح',
    description: 'Anatomy',
    rows: [
      { id: 'anat-001', front: 'Which nerve is injured in a mid-shaft fracture of the humerus?', back: '**Radial nerve** — causes wrist drop.' },
      { id: 'anat-002', front: 'The {{c1::recurrent laryngeal}} nerve supplies all intrinsic muscles of the larynx except the {{c2::cricothyroid}}.' },
      { id: 'anat-003', front: 'ما العصب المصاب في متلازمة النفق الرسغي؟', back: '**العصب المتوسط (Median nerve)**' },
      { id: 'anat-004', front: 'Name the rotator cuff muscles.', back: '**SITS**\n- Supraspinatus\n- Infraspinatus\n- Teres minor\n- Subscapularis' },
      { id: 'anat-005', front: 'The {{c1::left}} recurrent laryngeal nerve hooks around the {{c2::arch of the aorta}}.' },
      { id: 'anat-006', front: 'Which nerve is injured in a fracture of the neck of the fibula?', back: '**Common fibular (peroneal) nerve** — causes foot drop.' },
    ],
  },
];
