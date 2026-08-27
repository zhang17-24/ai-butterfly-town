import Phaser from "phaser";
import type { Npc } from "@ai-town/shared";
import { gameEvents } from "./event-bus";

const placeLabels = [
  { name: "栖岸咖啡馆", x: 132, y: 34 },
  { name: "安宁诊所", x: 785, y: 28 },
  { name: "老何杂货铺", x: 100, y: 322 },
  { name: "社区中心", x: 785, y: 232 },
  { name: "栖溪公寓", x: 748, y: 466 },
  { name: "河岸市集", x: 566, y: 192 },
];

type NpcMarker = Phaser.GameObjects.Container & {
  avatar: Phaser.GameObjects.Container;
  actionText: Phaser.GameObjects.Text;
};

export class TownScene extends Phaser.Scene {
  private markers = new Map<string, NpcMarker>();

  constructor() {
    super("TownScene");
  }

  preload(): void {
    this.load.image("qixi-town-map", "/assets/maps/qixi-town-prebuilt-v1.png");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#173e42");
    this.textures.get("qixi-town-map").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add.image(450, 310, "qixi-town-map").setDisplaySize(900, 620);
    this.add.rectangle(450, 310, 900, 620, 0x102d2c, 0.04);

    for (const place of placeLabels) {
      this.add.text(place.x, place.y, place.name, {
        color: "#fffaf0",
        backgroundColor: "#173b36c9",
        padding: { x: 7, y: 4 },
        fontSize: "12px",
        fontStyle: "bold",
        fontFamily: "sans-serif",
        stroke: "#173b36",
        strokeThickness: 1,
      }).setOrigin(0.5).setDepth(5);
    }
  }

  applyNpcs(npcs: Npc[]): void {
    if (!this.scene.isActive()) return;
    for (const npc of npcs) {
      let marker = this.markers.get(npc.profile.id);
      if (!marker) {
        const color = Phaser.Display.Color.HexStringToColor(npc.profile.color).color;
        const shadow = this.add.ellipse(0, 12, 25, 8, 0x000000, 0.32);
        const avatar = this.createPixelAvatar(npc.profile.id, color);
        const name = this.add.text(0, -36, npc.profile.name, {
          color: "#173024", backgroundColor: "#f5fff2dd", padding: { x: 6, y: 3 }, fontSize: "12px", fontFamily: "sans-serif",
        }).setOrigin(0.5);
        const actionText = this.add.text(0, 23, npc.state.currentAction, {
          color: "#344a3f", backgroundColor: "#ffffffcc", padding: { x: 5, y: 2 }, fontSize: "10px", fontFamily: "sans-serif",
        }).setOrigin(0.5, 0);
        marker = this.add.container(npc.state.position.x, npc.state.position.y, [shadow, avatar, name, actionText]) as NpcMarker;
        marker.avatar = avatar;
        marker.actionText = actionText;
        marker.setSize(54, 76).setDepth(20).setInteractive({ useHandCursor: true });
        marker.on("pointerdown", () => gameEvents.dispatchEvent(new CustomEvent("npc:selected", { detail: npc.profile.id })));
        marker.on("pointerover", () => avatar.setScale(1.14));
        marker.on("pointerout", () => avatar.setScale(1));
        this.markers.set(npc.profile.id, marker);
      }
      marker.actionText.setText(npc.state.currentAction);
      if (Phaser.Math.Distance.Between(marker.x, marker.y, npc.state.position.x, npc.state.position.y) > 2) {
        this.tweens.killTweensOf(marker);
        this.tweens.add({ targets: marker, x: npc.state.position.x, y: npc.state.position.y, duration: 1200, ease: "Sine.easeInOut" });
      }
    }
  }

  private createPixelAvatar(npcId: string, clothingColor: number): Phaser.GameObjects.Container {
    const dark = Phaser.Display.Color.ValueToColor(clothingColor).darken(30).color;
    const palettes: Record<string, { hair: number; skin: number; accent: number }> = {
      npc_lin_xia: { hair: 0x3f2722, skin: 0xf2bd91, accent: 0xf6d36a },
      npc_shen_zhiheng: { hair: 0x27313a, skin: 0xe8b88f, accent: 0xeef6f2 },
      npc_he_jianguo: { hair: 0x4a4742, skin: 0xdba679, accent: 0xe3be63 },
      npc_zhou_fang: { hair: 0x292b25, skin: 0xe7ad7e, accent: 0xe86943 },
      npc_tang_yucheng: { hair: 0x3a253f, skin: 0xefb98d, accent: 0xf0cc72 },
    };
    const palette = palettes[npcId] ?? { hair: 0x352a28, skin: 0xe8b184, accent: 0xf2ce72 };
    const parts: Phaser.GameObjects.GameObject[] = [
      this.add.rectangle(-6, 10, 7, 12, dark),
      this.add.rectangle(6, 10, 7, 12, dark),
      this.add.rectangle(-6, 17, 8, 4, 0x342f35),
      this.add.rectangle(6, 17, 8, 4, 0x342f35),
      this.add.rectangle(0, 1, 22, 20, clothingColor),
      this.add.rectangle(-13, 1, 4, 14, palette.skin),
      this.add.rectangle(13, 1, 4, 14, palette.skin),
      this.add.rectangle(0, -13, 18, 18, palette.skin),
      this.add.rectangle(0, -21, 20, 6, palette.hair),
      this.add.rectangle(-9, -15, 3, 11, palette.hair),
      this.add.rectangle(9, -16, 3, 8, palette.hair),
      this.add.rectangle(-4, -13, 2, 2, 0x302a2a),
      this.add.rectangle(4, -13, 2, 2, 0x302a2a),
      this.add.rectangle(0, 0, 4, 12, palette.accent),
    ];
    if (npcId === "npc_shen_zhiheng") {
      parts.push(this.add.rectangle(-7, 1, 5, 18, 0xeaf3ef), this.add.rectangle(7, 1, 5, 18, 0xeaf3ef));
    }
    if (npcId === "npc_zhou_fang") {
      parts.push(this.add.rectangle(11, 5, 8, 12, 0xc85a3c), this.add.rectangle(6, -2, 3, 22, 0x523e36).setAngle(-24));
    }
    if (npcId === "npc_tang_yucheng") {
      parts.push(this.add.rectangle(11, 3, 9, 7, 0x3c4148), this.add.rectangle(11, 3, 3, 3, 0x9bd2d0));
    }
    return this.add.container(0, -5, parts).setScale(1.15);
  }
}
