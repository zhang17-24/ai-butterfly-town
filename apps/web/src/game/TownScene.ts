import Phaser from "phaser";
import type { Npc } from "@ai-town/shared";
import { gameEvents } from "./event-bus";

const buildings = [
  { id: "cafe", name: "栖岸咖啡馆", x: 220, y: 110, w: 170, h: 120, color: 0xd99c72 },
  { id: "clinic", name: "安宁诊所", x: 610, y: 98, w: 150, h: 120, color: 0x91b6c9 },
  { id: "grocery", name: "老何杂货铺", x: 92, y: 372, w: 170, h: 120, color: 0xc7a66f },
  { id: "community", name: "社区中心", x: 650, y: 365, w: 160, h: 130, color: 0xa798bd },
  { id: "apartment", name: "栖溪公寓", x: 500, y: 500, w: 210, h: 86, color: 0xb68e86 },
];

type NpcMarker = Phaser.GameObjects.Container & { bodyCircle: Phaser.GameObjects.Arc; actionText: Phaser.GameObjects.Text };

export class TownScene extends Phaser.Scene {
  private markers = new Map<string, NpcMarker>();

  constructor() {
    super("TownScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#bfd9c2");
    this.add.rectangle(450, 310, 900, 620, 0xbfd9c2);
    this.add.rectangle(454, 315, 268, 620, 0x93b7c4, 0.9).setAngle(-7);
    this.add.rectangle(447, 315, 105, 620, 0xa9cbd4, 0.85).setAngle(-7);
    this.add.rectangle(450, 338, 900, 86, 0xd8d2b5);
    this.add.rectangle(452, 338, 900, 54, 0xc3bda4);
    this.add.text(398, 300, "滨 河 步 道", { color: "#526e65", fontSize: "13px", fontFamily: "sans-serif" }).setRotation(-0.12);
    this.add.rectangle(460, 335, 78, 138, 0xb7835f).setStrokeStyle(4, 0x8a6048);
    this.add.text(430, 329, "栖溪桥", { color: "#fff5e8", fontSize: "12px", fontFamily: "sans-serif" });
    this.add.ellipse(460, 420, 230, 112, 0x91b77b, 0.95);
    this.add.text(402, 404, "河岸广场", { color: "#2f5b43", fontSize: "16px", fontStyle: "bold", fontFamily: "sans-serif" });

    for (const building of buildings) {
      this.add.rectangle(building.x + building.w / 2, building.y + building.h / 2, building.w, building.h, building.color)
        .setStrokeStyle(3, 0xffffff, 0.55);
      this.add.rectangle(building.x + building.w / 2, building.y + 8, building.w + 10, 20, 0x6d4f43, 0.9);
      this.add.text(building.x + 12, building.y + 31, building.name, {
        color: "#23372d", fontSize: "15px", fontStyle: "bold", fontFamily: "sans-serif",
      });
    }

    for (let i = 0; i < 22; i++) {
      const x = 24 + (i * 83) % 860;
      const y = i % 2 === 0 ? 28 + (i % 5) * 18 : 572 - (i % 4) * 16;
      this.add.circle(x, y, 12, 0x638d64, 0.9);
      this.add.rectangle(x, y + 17, 4, 17, 0x765c45);
    }
  }

  applyNpcs(npcs: Npc[]): void {
    if (!this.scene.isActive()) return;
    for (const npc of npcs) {
      let marker = this.markers.get(npc.profile.id);
      if (!marker) {
        const color = Phaser.Display.Color.HexStringToColor(npc.profile.color).color;
        const shadow = this.add.ellipse(0, 16, 32, 12, 0x000000, 0.18);
        const bodyCircle = this.add.circle(0, 0, 17, color).setStrokeStyle(3, 0xffffff, 0.95);
        const initials = this.add.text(0, -1, npc.profile.name.slice(-1), {
          color: "#ffffff", fontSize: "14px", fontStyle: "bold", fontFamily: "sans-serif",
        }).setOrigin(0.5);
        const name = this.add.text(0, -30, npc.profile.name, {
          color: "#173024", backgroundColor: "#f5fff2dd", padding: { x: 6, y: 3 }, fontSize: "12px", fontFamily: "sans-serif",
        }).setOrigin(0.5);
        const actionText = this.add.text(0, 28, npc.state.currentAction, {
          color: "#344a3f", backgroundColor: "#ffffffcc", padding: { x: 5, y: 2 }, fontSize: "10px", fontFamily: "sans-serif",
        }).setOrigin(0.5, 0);
        marker = this.add.container(npc.state.position.x, npc.state.position.y, [shadow, bodyCircle, initials, name, actionText]) as NpcMarker;
        marker.bodyCircle = bodyCircle;
        marker.actionText = actionText;
        marker.setSize(54, 72).setInteractive({ useHandCursor: true });
        marker.on("pointerdown", () => gameEvents.dispatchEvent(new CustomEvent("npc:selected", { detail: npc.profile.id })));
        marker.on("pointerover", () => bodyCircle.setScale(1.12));
        marker.on("pointerout", () => bodyCircle.setScale(1));
        this.markers.set(npc.profile.id, marker);
      }
      marker.actionText.setText(npc.state.currentAction);
      if (Phaser.Math.Distance.Between(marker.x, marker.y, npc.state.position.x, npc.state.position.y) > 2) {
        this.tweens.killTweensOf(marker);
        this.tweens.add({ targets: marker, x: npc.state.position.x, y: npc.state.position.y, duration: 1200, ease: "Sine.easeInOut" });
      }
    }
  }
}

