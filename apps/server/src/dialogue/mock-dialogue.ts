import type { Npc } from "@ai-town/shared";

export function createMockDialogueReply(npc: Npc, message: string, recalled: Array<{ createdAt: number; content: string; reasons: string[] }> = []): string {
  const text = message.trim();
  const topic = detectTopic(text);
  const prefix = moodPrefix(npc);
  const memoryQuote = quoteMemory(recalled);
  const replies: Record<string, Record<string, string>> = {
    npc_lin_xia: {
      greeting: "你好。我正把市集事项重新排一遍，你来得正好。",
      market: "我最担心临时变动没人负责。要是你愿意帮忙，我们可以先把任务和截止时间写清楚。",
      crisis: "如果暴雨预警确认，我会先评估延期还是移到室内。摊位搭建能拆，但人员安全和退费说明必须第一时间公布。",
      health: "健康方面最好听沈医生的。我能做的是把现场休息区和饮水准备好。",
      help: "可以。先告诉我你能负责多久，我会给你一件范围明确、能按时交付的事。",
      unknown: "我怕自己理解错。你能把想做的事、时间和地点说具体一点吗？",
    },
    npc_shen_zhiheng: {
      greeting: "你好。如果是身体不舒服，请直接告诉我症状和持续时间。",
      market: "市集可以办，但急救点、疏散路线和天气信息必须先核实，不能凭感觉。",
      crisis: "暴雨天我担心的是滑倒和失温。疏散路线和避雨点是开放的，急救物资我可以今天清点一遍。",
      health: "先说具体症状，不要急着下结论。我需要知道什么时候开始、是否加重。",
      help: "可以，但我会先确认风险和需要的物资，再决定怎么处理。",
      unknown: "目前信息不够。我不想猜测，你可以再提供一个可核实的细节吗？",
    },
    npc_he_jianguo: {
      greeting: "来了？要买东西就说清数量，账目别含糊。",
      market: "市集当然要备货，但先把数量和付款时间说定。上次临时取消，我可还记着。",
      crisis: "取消消息先别算数，等官方通知。真取消了，我得把易腐货调回仓库登记，损失要算清楚。",
      health: "不舒服就去诊所，别拿身体省钱。需要水和基础用品我这里有。",
      help: "帮忙可以，先说要多少、什么时候还。能兑现，我就给你留着。",
      unknown: "你这话太空了。具体要什么、多少、什么时候用？",
    },
    npc_zhou_fang: {
      greeting: "嗨，我刚好在看路线。你要去哪儿，我也许知道条快路。",
      market: "摊位物资我能送，但河边一堵就麻烦。最好准备一条备用路线。",
      crisis: "暴雨的话河边肯定堵。我先把东线走过一遍，看有没有能绕的桥；实在不行就提前拉货。",
      health: "要真不舒服就别硬撑，我可以送你去诊所，路我熟。",
      help: "行啊，能顺路我现在就做；不顺路也先告诉我地点。",
      unknown: "我没完全听懂。你直接说要去哪儿，或者要我带什么吧。",
    },
    npc_tang_yucheng: {
      greeting: "你好。我正在整理市集采访提纲，你如果有消息，也请告诉我来源。",
      market: "我会报道筹备进展，但不会只写热闹。谁负责、风险是什么，都要核实。",
      crisis: "暴雨消息我会先查气象来源再做报道。谁在改计划、谁负责疏散，这些是读者真正关心的。",
      health: "健康信息不能当传闻扩散。最好让沈医生确认，我只记录可公开的事实。",
      help: "可以。你先告诉我这件事是谁亲眼看到的，我会从来源开始核验。",
      unknown: "这个说法还缺来源和细节。你是亲眼看到的，还是听别人说的？",
    },
  };
  return `${prefix}${replies[npc.profile.id]?.[topic] ?? replies[npc.profile.id]?.unknown ?? "你能再说具体一点吗？"}${memoryQuote}`;
}

/**
 * §7.2 Mock 记忆注入:命中相关关键词且在召回中时,以「我记得…」过去式句架引用,
 * 既展示记忆闭环,又不把旧经历当成当前事实。
 */
function quoteMemory(recalled: Array<{ createdAt: number; content: string; reasons: string[] }>): string {
  if (recalled.length === 0) return "";
  const hit = recalled[0];
  const minute = hit.createdAt;
  const hour = Math.floor((minute % (24 * 60)) / 60);
  const timeLabel = hour < 12 ? "上午" : hour < 18 ? "下午" : "晚上";
  return `（我记得${timeLabel}${String(hour).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}的时候——${hit.content.slice(0, 40)}…那是当时的事，现在情况未必一样。）`;
}

function detectTopic(message: string): "greeting" | "market" | "crisis" | "health" | "help" | "unknown" {
  if (/暴雨|台风|暴雨预警|取消|停办|关闭|撒离|撤离|紧急|危险|延期/.test(message)) return "crisis";
  if (/你好|嗨|早上好|下午好|在吗/.test(message)) return "greeting";
  if (/市集|摊位|活动|河岸/.test(message)) return "market";
  if (/身体|健康|不舒服|医生|急救/.test(message)) return "health";
  if (/帮|需要|能不能|可以吗|请求/.test(message)) return "help";
  return "unknown";
}

function moodPrefix(npc: Npc): string {
  if (npc.state.stress >= 75) return "（看起来有些紧绷。）";
  if (npc.state.energy <= 25) return "（显得有些疲惫。）";
  if (npc.state.mood >= 75) return "（带着轻松的笑意。）";
  return "";
}
