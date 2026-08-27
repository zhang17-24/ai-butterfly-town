import Phaser from "phaser";
import { createNavigationGrid, type Npc, type Player, type Position } from "@ai-town/shared";
import { qixiBlueprint } from "@ai-town/shared/qixi-blueprint";
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
  avatar: Phaser.GameObjects.GameObject & { setScale?: (value: number) => unknown; setFlipX?: (value: boolean) => unknown };
  actionText: Phaser.GameObjects.Text;
  pathKey: string | null;
  spriteKey: string | null;
};

const SPRITE_IDS = ["npc_lin_xia", "npc_shen_zhiheng", "npc_he_jianguo", "npc_zhou_fang", "npc_tang_yucheng", "player"] as const;

export class TownScene extends Phaser.Scene {
  private markers = new Map<string, NpcMarker>();
  private playerMarker: (Phaser.GameObjects.Container & { spriteKey: string | null; avatar: Phaser.GameObjects.GameObject }) | null = null;
  private playerAvatar: Phaser.GameObjects.GameObject | null = null;
  private walkableOverlay: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super("TownScene");
  }

  preload(): void {
    this.load.image("qixi-town-map", "/assets/maps/qixi-town-prebuilt-v1.png");
    for (const id of SPRITE_IDS) this.load.image(`sheet-${id}`, `/assets/npcs/${id}.png`);
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#173e42");
    this.textures.get("qixi-town-map").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.add.image(450, 310, "qixi-town-map").setDisplaySize(900, 620);
    this.add.rectangle(450, 310, 900, 620, 0x102d2c, 0.04);
    this.drawWalkableOverlay();
    this.registerSpriteSheets();

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
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      if (currentlyOver.length > 0) return;
      gameEvents.dispatchEvent(new CustomEvent("map:move", { detail: { x: Math.round(pointer.worldX), y: Math.round(pointer.worldY) } }));
    });
  }

  applyNpcs(npcs: Npc[]): void {
    if (!this.scene.isActive()) return;
    for (const npc of npcs) {
      let marker = this.markers.get(npc.profile.id);
      if (!marker) {
        const color = Phaser.Display.Color.HexStringToColor(npc.profile.color).color;
        const shadow = this.add.ellipse(0, 12, 25, 8, 0x000000, 0.32);
        const { avatar, spriteKey } = this.createAvatar(npc.profile.id, npc.profile.color);
        const name = this.add.text(0, -36, npc.profile.name, {
          color: "#173024", backgroundColor: "#f5fff2dd", padding: { x: 6, y: 3 }, fontSize: "12px", fontFamily: "sans-serif",
        }).setOrigin(0.5);
        const actionText = this.add.text(0, 23, npc.state.currentAction, {
          color: "#344a3f", backgroundColor: "#ffffffcc", padding: { x: 5, y: 2 }, fontSize: "10px", fontFamily: "sans-serif",
        }).setOrigin(0.5, 0);
        marker = this.add.container(npc.state.position.x, npc.state.position.y, [shadow, avatar, name, actionText]) as NpcMarker;
        marker.avatar = avatar as NpcMarker["avatar"];
        marker.actionText = actionText;
        marker.pathKey = null;
        marker.spriteKey = spriteKey;
        marker.setSize(54, 76).setDepth(20).setInteractive({ useHandCursor: true });
        marker.on("pointerdown", () => gameEvents.dispatchEvent(new CustomEvent("npc:selected", { detail: npc.profile.id })));
        marker.on("pointerover", () => (avatar as unknown as { setScale: (value: number) => void }).setScale(spriteKey ? 0.145 : 1.28));
        marker.on("pointerout", () => (avatar as unknown as { setScale: (value: number) => void }).setScale(spriteKey ? 0.13 : 1.15));
        this.markers.set(npc.profile.id, marker);
      }
      marker.actionText.setText(npc.state.currentAction);
      this.moveNpc(marker, npc);
    }
  }

  private moveNpc(marker: NpcMarker, npc: Npc): void {
    const path = npc.state.actionPath;
    const nowPathKey = path && path.length > 1 ? path.map((point) => `${point.x},${point.y}`).join("|") : null;
    if (nowPathKey && path && nowPathKey !== marker.pathKey) {
      marker.pathKey = nowPathKey;
      this.tweens.killTweensOf(marker);
      // 从 marker 实际位置续接,避免跳到路径起点造成瞬移
      const start = { x: marker.x, y: marker.y };
      const resume = Math.hypot(path[0].x - start.x, path[0].y - start.y) > 1 ? [start, ...path] : path;
      this.animateNpcAlong(marker, resume, 0);
      return;
    }
    if (!nowPathKey) {
      marker.pathKey = null;
      const distance = Phaser.Math.Distance.Between(marker.x, marker.y, npc.state.position.x, npc.state.position.y);
      if (distance > 2) {
        this.tweens.killTweensOf(marker);
        this.tweens.add({ targets: marker, x: npc.state.position.x, y: npc.state.position.y, duration: 700, ease: "Sine.easeInOut" });
      }
    }
  }

  private animateNpcAlong(marker: NpcMarker, path: Position[], index: number): void {
    if (index >= path.length) return;
    const destination = path[index];
    const distance = Phaser.Math.Distance.Between(marker.x, marker.y, destination.x, destination.y);
    if (index === 0) this.showWalkDirection(marker, path);
    this.tweens.add({
      targets: marker,
      x: destination.x,
      y: destination.y,
      duration: Math.max(110, Math.min(240, distance * 5)),
      ease: "Linear",
      onComplete: () => {
        if (index + 1 >= path.length) {
          this.stopWalk(marker);
        } else this.animateNpcAlong(marker, path, index + 1);
      },
    });
  }

  private showWalkDirection(marker: NpcMarker, path: Position[]): void {
    const dxTotal = path[path.length - 1].x - marker.x;
    const dyTotal = path[path.length - 1].y - marker.y;
    if (Math.abs(dxTotal) >= Math.abs(dyTotal)) {
      this.showWalk(marker, dxTotal > 0 ? "right" : "left");
    } else {
      this.showWalk(marker, dyTotal > 0 ? "front" : "back");
    }
  }

  private showWalk(marker: NpcMarker, base: "left" | "right" | "front" | "back"): void {
    if (!marker.spriteKey || !(marker.avatar as unknown as { anims?: unknown }).anims) return;
    const sprite = marker.avatar as unknown as Phaser.GameObjects.Sprite;
    // 统一直播正面行走行：左右移动用镜像，上下不换行（消除侧身/转身帧带来的旋转感）
    sprite.anims.play(`${marker.spriteKey}-walk-front`, true);
    sprite.setFlipX(base === "right");
  }

  private createAvatar(id: string, clothingColor: string): { avatar: Phaser.GameObjects.GameObject; spriteKey: string | null } {
    if (this.textures.exists(`charsheet-${id}`)) {
      const sprite = this.add.sprite(0, -5, `charsheet-${id}`, "18").setScale(0.13).setOrigin(0.5, 0.62);
      return { avatar: sprite, spriteKey: `npc-${id}` };
    }
    return { avatar: this.createPixelAvatar(id, Phaser.Display.Color.HexStringToColor(clothingColor).color), spriteKey: null };
  }

  private stopWalk(marker: { spriteKey: string | null; avatar: Phaser.GameObjects.GameObject } | null): void {
    if (!marker?.spriteKey || !(marker.avatar as unknown as { anims?: unknown }).anims) return;
    (marker.avatar as unknown as Phaser.GameObjects.Sprite).anims.play(`${marker.spriteKey}-idle-front`, true);
  }

  private drawWalkableOverlay(): void {
    const grid = createNavigationGrid(qixiBlueprint);
    const overlay = this.add.graphics().setDepth(4);
    overlay.fillStyle(0x00d4ff, 1);
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        if (!grid.walkable[row][column]) continue;
        overlay.fillRect(column * grid.tileSize, row * grid.tileSize, grid.tileSize, grid.tileSize);
      }
    }
    this.walkableOverlay = overlay;
    overlay.setVisible(false);
    gameEvents.addEventListener("walkable:visible", (event) => {
      this.setWalkableVisible((event as CustomEvent<boolean>).detail);
    });
  }

  setWalkableVisible(visible: boolean): void {
    if (!this.walkableOverlay) return;
    this.walkableOverlay.setVisible(visible);
    this.walkableOverlay.setAlpha(visible ? 0.55 : 0);
  }

  applyPlayer(player: Player | null, path: Position[] = []): void {
    if (!this.scene.isActive() || !player) return;
    if (!this.playerMarker) {
      const halo = this.add.ellipse(0, 13, 34, 14, 0x68d5ff, 0.48).setStrokeStyle(2, 0xeaffff, 0.9);
      const { avatar, spriteKey } = this.createAvatar("player", "#285f83");
      const badge = this.add.text(0, -40, "你", {
        color: "#e9fbff", backgroundColor: "#153f54e8", padding: { x: 8, y: 4 }, fontSize: "12px", fontStyle: "bold", fontFamily: "sans-serif",
      }).setOrigin(0.5);
      this.playerAvatar = avatar;
      this.playerMarker = Object.assign(
        this.add.container(player.position.x, player.position.y, [halo, avatar, badge]).setDepth(30),
        { spriteKey, avatar },
      );
    }
    this.tweens.killTweensOf(this.playerMarker);
    const destinations = path.length > 1
      ? [{ x: this.playerMarker.x, y: this.playerMarker.y }, ...path.slice(1)]
      : [player.position];
    this.movePlayerAlong(destinations, 0);
  }

  private movePlayerAlong(path: Position[], index: number): void {
    if (!this.playerMarker || index >= path.length) return;
    const destination = path[index];
    const distance = Phaser.Math.Distance.Between(this.playerMarker.x, this.playerMarker.y, destination.x, destination.y);
    if (index === 0) {
      const end = path[path.length - 1];
      const dxTotal = end.x - this.playerMarker.x;
      const dyTotal = end.y - this.playerMarker.y;
      if (Math.abs(dxTotal) >= Math.abs(dyTotal)) this.showWalkCursor(dxTotal > 0 ? "right" : "left");
      else this.showWalkCursor(dyTotal > 0 ? "front" : "back");
    }
    this.tweens.add({
      targets: this.playerMarker,
      x: destination.x,
      y: destination.y,
      duration: Math.max(70, Math.min(180, distance * 4)),
      ease: "Linear",
      onComplete: () => {
        if (index + 1 >= path.length) this.stopWalk(this.playerMarker);
        else this.movePlayerAlong(path, index + 1);
      },
    });
  }

  private showWalkCursor(base: "left" | "right" | "front" | "back"): void {
    if (!this.playerMarker?.spriteKey || !(this.playerAvatar as unknown as { anims?: unknown }).anims) return;
    const sprite = this.playerAvatar as unknown as Phaser.GameObjects.Sprite;
    const prefix = this.playerMarker.spriteKey;
    if (base === "left" || base === "right") {
      sprite.anims.play(`${prefix}-walk-front`, true);
      sprite.setFlipX(base === "right");
    } else {
      sprite.anims.play(`${prefix}-walk-front`, true);
    }
  }

  private registerSpriteSheets(): void {
    for (const id of SPRITE_IDS) {
      const sourceKey = `sheet-${id}`;
      if (!this.textures.exists(sourceKey)) continue;
      const source = this.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
      const { canvas } = chromaKeySheet(source);
      const key = `charsheet-${id}`;
      try {
        const frameWidth = Math.floor(canvas.width / 6);
        const frameHeight = Math.floor(canvas.height / 5);
        this.textures.addCanvas(key, canvas);
        const texture = this.textures.get(key);
        for (let row = 0; row < 5; row += 1) {
          for (let column = 0; column < 6; column += 1) {
            texture.add(`${row * 6 + column}`, 0, column * frameWidth, row * frameHeight, frameWidth, frameHeight);
          }
        }
        texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
        const prefix = `npc-${id}`;
        if (!this.anims.exists(`${prefix}-walk-front`)) {
          const frames = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, offset) => ({ key, frame: `${start + offset}` }));
          this.anims.create({ key: `${prefix}-walk-front`, frames: frames(6, 9), frameRate: 5, repeat: -1 });
          this.anims.create({ key: `${prefix}-idle-front`, frames: [{ key, frame: "18" }], frameRate: 1 });
        }
      } catch {
        continue;
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

function chromaKeySheet(source: HTMLImageElement): { canvas: HTMLCanvasElement } {
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const { width, height } = canvas;
  const isPureGreen = (index: number) => {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    return g > 100 && g > r * 1.35 && g > b * 1.2;
  };
  const greenMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isPureGreen((y * width + x) * 4)) greenMask[y * width + x] = 1;
    }
  }
  const neighborsGreen = (x: number, y: number): number => {
    let count = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && greenMask[ny * width + nx]) count += 1;
      }
    }
    return count;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (greenMask[y * width + x]) {
        data[index + 3] = 0;
        continue;
      }
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      // 绿幕混色的边缘像素：浅色(灰白/淡绿)且被绿色包围 → 抠成透明,消除白边
      const isPaleEdge = g >= b && g > 108 && (r + g + b) / 3 > 130 && g >= r * 1.02;
      if (isPaleEdge && neighborsGreen(x, y) >= 4) data[index + 3] = 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas };
}
