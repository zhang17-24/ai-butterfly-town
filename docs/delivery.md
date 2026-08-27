# 交付指南 · AI 蝴蝶小镇(面试作业)

> 本文是交付与演示的落地手册:怎么本地跑、怎么部署上线、面试官第一次怎么体验、3–5 分钟视频怎么录。
> 与 `README.md`(工程视角)配套;本文偏「交付动作」。

## 0. 一句话

登录 `demo / town1234`(可在 `apps/server/.env` 修改)→ 看到栖溪镇 5 位居民自主行动 → 点击居民对话/看决策与记忆 → 注入事件看蝴蝶效应 → 跳过时间/回退分支 → 用一句话创建你自己的小镇。

## 1. 密钥管理(重要)

- **密钥全部在 `apps/server/.env`**(本地机),`*.env` 已 gitignore,**不入仓库、不进镜像**。
- 需要的项:
  ```env
  # 思考模型(OpenAI 兼容 chat):DeepSeek 示例,已实测
  AI_SIMULATION_API_KEY=sk-xxx
  AI_SIMULATION_BASE_URL=https://api.deepseek.com/v1
  AI_SIMULATION_MODEL=deepseek-chat
  AI_SIMULATION_API_STYLE=chat
  # 生图(Seedream 5.0,火山方舟)
  AI_IMAGE_API_KEY=ark-xxx
  AI_IMAGE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3/images/generations
  AI_IMAGE_MODEL=doubao-seedream-5-0-260128
  ```
- 任一 Key/Model 留空 → 自动进入完整 Mock 模式(可离线演示,且是评分点之一)。
- 自检:`pnpm test:ai`(chat 决策/对话 + seedream 生图,3 项全部通过才是配置正确)。

## 2. 本地运行(5 分钟跑通)

```bash
pnpm install
pnpm dev            # 服务端 :3100 + 前端 :3200
# 打开 http://localhost:3200 → 输入 demo / town1234
```

一次性检查:`pnpm verify`(lint+typecheck+test+build)、`pnpm test:e2e`(HTTP 冒烟 10 步)、`pnpm delivery:check`。

## 3. 部署上线

### 方式 A:Docker(本地 / 任意主机)

```bash
docker compose up --build -d      # 单服务:静态页+REST+WS+仿真都在这一个容器
# 访问 http://localhost:3100
docker compose exec ai-town sh -c "cat /etc/hosts" # 手动冒烟:curl :3100/api/health
```
生产环境变量用宿主机 `.env` 注入 compose(参考 `docker compose.yml` 的 `${VAR}` 透传)。

### 方式 B:Render(推荐,参考同机美团项目的 render.yaml 做法)

新建 `render.yaml`(Blueprint 一键部署,与美团项目同款模式):

```yaml
services:
  - type: web
    name: ai-town
    runtime: docker
    plan: starter            # 需要持久磁盘存 SQLite,starter($7/月)起步
    dockerfilePath: ./Dockerfile
    healthCheckPath: /api/health
    envVars:
      - key: COOKIE_SECRET
        generateValue: true
      - key: DEMO_USERNAME
        value: demo
      - key: DEMO_PASSWORD
        value: town1234
      - key: AI_SIMULATION_API_KEY
        sync: false          # 面板里粘贴,不落仓库
      - key: AI_IMAGE_API_KEY
        sync: false
    disk:
      name: ai-town-data
      mountPath: /app/data
      sizeGB: 1
```

步骤:GitHub 仓库 → Render Dashboard → New Blueprint → 选仓库 → 粘贴上述 envVars → Deploy。
要点:
- 镜像内 `SERVE_WEB=1` 时一个端口全搞定(cookie/CORS 同源,无需配域)。
- 免费层冷启动:Render 免费版 15 分钟不访问会回收内存,首次打开等待约 30–60s(演示前先热一下)。
- 有磁盘的数据(记忆/事件/快照)全在 `/app/data/ai-town.db`,容器重建不丢。

## 4. 面试官体验路径(推荐演示动线)

1. **登录**:`demo/town1234`(可再备 `admin` 账号,权限仅做区分)。
2. **观察 5 位居民**:人物沿 A* 路径真实行走,顶栏可开「行走区域」叠加层;点击人物 → 面板:状态条 / 决策 Trace(AI vs Mock 徽标)/ **记忆层**(时间线+召回理由+重要度星标)。
3. **对话**:点击任一居民 → 对话框;问「市集还办吗?」→ AI 或 Mock 第一人称回答;结束后检查面板「记忆 +1 条」。
4. **注入事件(蝴蝶效应)**:右侧「事件注入」→ 选「暴雨预警」模板或自由输入一句 → 先出预览(哪些人知情、各自怎么理解)→ 确认写入 → 因果页 `/world/:id/causal` 看传播链;居民下次决策/对话开始引用这次事件(记忆召回)。
5. **时间旅行**:顶栏「+30 分钟 / +1 小时 / +3 小时」后台真实模拟(进度条),紧急事件会提前停;「创建分支」从最新快照开新时间线(世界回退并暂停)。
6. **一句话建世界**:首页/新建页输入「山间茶园小镇,有茶馆、竹林和溪边集市」→ 六阶段进度(结构→校验→美术→审查→寻路→落库)→ 进入新世界(程序化地图+自带居民)。
7. **降级演示**:有 Key 也可故意把 `AI_SIMULATION_API_KEY` 清空重启 → 全程 Mock;或看 `/dev/ai`(AiLab)对比 AI vs Mock 决策。

## 5. 3–5 分钟录制脚本(含讲解词)

> 建议 OBS/QuickTime 录屏 1440p,开场切到浏览器全屏,声画同步;每节 20–50s。

| 时间 | 动作 | 讲解词(要点) |
| --- | --- | --- |
| 0:00–0:20 | 标题页/仓库地址 | 这是腾讯 AI 全栈作业:AI 蝴蝶小镇。ts+nest 式 monorepo:React+Phaser 前端、Fastify+SQLite 服务端、共享 Zod 契约。 |
| 0:20–0:55 | 登录 demo → 栖溪镇 | 5 位居民各有性格与需求(hunger/energy/mood/stress/social),每 2 秒一世界分钟自主决策:先按状态+性格+时段做效用评分,再让 AI 从受限候选中选一个,输出过 JSON Schema 校验,失败自动降级 Mock。移动不是瞬移:Blueprint 生成 900×620 网格,居民走 A* 路径,可开「行走区域」验证。 |
| 0:55–1:40 | 点林夏 → 面板:状态/决策/记忆 | 每次决策落 AiTrace(模型、输入上下文、候选分、理由)。记忆层是本项目重点(D13/D14):三类记忆(经历/事件/行动)+每日摘要;按「命中词/重要度/新近度/对象相关」四维打分召回,理由逐条可见,且注入同一 Prompt——看 Trace 里的 recalledMemories 与 memorySection。 |
| 1:40–2:20 | 对话 2 句 | 对话与决策走同一治理链:AI 回答(Schema 校验+修复一次)→ Mock 模板兜底(暴雨/市集等话题分角色);结束后 NPC 写入自己的主观记忆。问「上次暴雨呢?」可让 AI「想起来」。 |
| 2:20–3:05 | 事件注入 → 因果页 | 输入「气象台发布暴雨预警,河岸场地可能封闭」→ 预览:解析成结构化事件,按 public/本地/目击分层计算「谁知道什么」(knowledge 通道)→ 确认提交(单事务+版本+幂等)。因果页回看链:事件→知识→决策引用→后续事件。 |
| 3:05–3:45 | 跳过时间 +1 小时 → 分支 | 快进是后台作业:完整模拟每一分钟到目标,遇到紧急事件提前停(防御潮汛);「创建分支」从周期快照(branch_id)开新时间线并回滚状态——面试讲「版本化世界与灾难恢复」。 |
| 3:45–4:40 | 一句话建世界 | 首页输入一句话 → 六阶段作业(模板结构→结构校验→程序化地图→寻路测试→入库);加载新世界地图与居民。讲「同一套坐标系,蓝图权威,AI 生图(Seedream)作为增强层;Key 缺席自动降级程序化」。 |
| 4:40–5:00 | 收尾:测试/密钥/文档 | `pnpm verify` 与 `pnpm test:ai`(真实 DeepSeek+Seedream 契约测试)、`GET /api/openapi.json` 自动生成;密钥全在 .env 不入库;AI 全部失败仍有 Mock 完整体验。 |

**演示前的 5 分钟自检清单**
- [ ] `pnpm dev` 双服务起来,`pnpm test:ai` 3/3;
- [ ] 浏览器已登录 `demo/town1234`,世界至少 2 分钟运行时间(居民在路上);
- [ ] 事件面板有两条最近提交,记忆面板有 ≥1 条 memory;
- [ ] 给观众留一句:「时间可以重来,世界由你一句话重新生成」。

## 6. 常见翻车点

- **冷启动**:线上第一次打开可能要 30s+(Mock 开始秒进;等待后自动续上)。
- **AI 超时**:决策模型限 15s/次;若连续失败会自动 Mock,右上角 world.status 里的 mode 可提示。
- **端口占用**:3100/3200 已占用时改 `.env` 的 PORT / vite config 端口,或直接 `docker compose up`(单端口 3100)。
- **数据重置**:删 `data/ai-town.db` 即全新开局(自动迁移)。
