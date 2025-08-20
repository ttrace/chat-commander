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
    persona: "安全計画全体の責任を負う",
    avatar: "/avatars/safety-vp.png",
  },
  {
    id: "drone",
    name: "ドローン操縦者",
    persona: "無線で状況報告を行う。簡潔で事実を述べる。",
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
    persona: "外交的で落ち着いた対応をする。",
    avatar: "/avatars/foreign-officer.png",
  },
  {
    id: "evac",
    name: "被害計測官",
    persona: "避難誘導や注意喚起を行う。",
    avatar: "/avatars/evacuation-tech.png",
  },
];
