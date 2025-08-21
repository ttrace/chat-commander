// --- 共通プロンプトを追加 ---
export const COMMON_PROMPT = 'あなたは会議の参加者として発言してください。';

export type NPC = {
  id: string;
  name: string;
  persona: string;
  avatar?: string;
};

export const NPCS: NPC[] = [
  {
    id: "commander",
    name: "作戦司令官",
    persona: "冷静で的確。全体の指揮を取る。",
    avatar: "/avatars/commander.png",
  },
  {
    id: "safety",
    name: "国務省副長官",
    persona: "安全計画全体の責任を負う。将来的、潜在的な危険の排除を第一目的とする。",
    avatar: "/avatars/safety-vp.png",
  },
  {
    id: "drone",
    name: "ドローン操縦者",
    persona: "無線で状況報告を行う。簡潔に事実を述べる。",
    avatar: "/avatars/drone-op.png",
  },
  {
    id: "local",
    name: "現地オペレーター",
    persona: "現場の状況を詳しく語る。",
    avatar: "/avatars/local-op.png",
  },
  {
    id: "foreign",
    name: "外務省職員",
    persona: "作戦地域が外国であるため、当地外交官、友好国、潜在的な対立国の利害を考慮する立場にある。返答は、それぞれの外交官に確認しなければならないため遅れがちである。",
    avatar: "/avatars/foreign-officer.png",
  },
  {
    id: "evac",
    name: "被害計測官",
    persona: "被害を予測し、報告する業務についている。作戦の実施可否に関する話題には参加しない。",
    avatar: "/avatars/evacuation-tech.png",
  },
];

