import { baseArtById } from "../src/shared/base-library";
import { randomInt, randomUUID } from "node:crypto";
import type {
  World,
  Identity,
  Character,
  Log,
  Scene,
} from "../src/shared/types";
import {
  CLASSES,
  characterProblems,
  derived,
  learnedAbilities,
  newScene,
} from "../src/shared/rules";
import expansionResourceData from "../src/shared/expansion-resource-index.json";
const expansionResources: Record<string, string> = expansionResourceData;
import * as v from "./validation";
import { updateJournal } from "./journal";
import {
  moveOnGrid,
  preserveExploration,
  requireExplorationFinished,
  updateExploration,
} from "./exploration";
const gm = (me: Identity) =>
  v.insist(me.role === "gm", "此操作由 GM 执行", 403);
function actor(w: World, me: Identity, id: string, control = true) {
  const c = w.characters.find((x) => x.id === id);
  v.insist(c, "角色不存在", 404);
  v.insist(
    me.role === "gm" ||
      (control ? c.owner === me.id : c.public || c.owner === me.id),
    "你不能操作这个角色",
    403,
  );
  return c;
}
function current(w: World) {
  const s = w.scenes.find((x) => x.id === w.activeScene);
  v.insist(s, "请先打开场景");
  return s;
}
function addLog(
  w: World,
  me: Identity,
  kind: Log["kind"],
  text: string,
  c?: Character,
  extra?: Partial<Log>,
) {
  w.logs.push({
    id: randomUUID(),
    at: Date.now(),
    kind,
    channel:
      kind === "roll"
        ? "dice"
        : kind === "action"
          ? "combat"
          : kind === "speech"
            ? "ic"
            : kind === "chat"
              ? "ooc"
              : "system",
    author: me.id,
    actor: c?.id ?? "",
    name: c?.name ?? me.name,
    text,
    private: !!c && !c.public,
    ...extra,
  });
  w.logs = w.logs.slice(-300);
}
function expected(actual: number | undefined, value: unknown) {
  v.insist(
    actual === undefined ? value === null : actual === value,
    "此内容已被更新。请重新打开编辑，避免覆盖他人的修改。",
    409,
  );
}
function checkAssets(w: World, ids: string[]) {
  for (const id of ids.filter(Boolean))
    v.insist(
      baseArtById.has(id) || w.assets.some((a) => a.id === id),
      "引用的素材不存在",
    );
}
function checkScene(w: World, s: Scene) {
  checkAssets(w, [s.background, s.audio]);
  for (const x of [...s.cast, ...s.tokens, ...s.cues.filter((c) => c.actor)])
    v.insist(
      w.characters.some((c) => c.id === x.actor),
      "场景引用的角色不存在",
    );
}
export function referencedAssets(w: World, me: Identity) {
  const refs = new Set<string>();
  const scenes =
    me.role === "gm"
      ? w.scenes
      : w.scenes.filter((s) => s.id === w.activeScene && s.public);
  for (const s of scenes) {
    refs.add(s.background);
    refs.add(s.audio);
    for (const slot of s.cast) {
      const c = w.characters.find((c) => c.id === slot.actor);
      if (c && (me.role === "gm" || c.public)) {
        refs.add(c.portrait);
        refs.add(
          c.expressions.find((e) => e.id === slot.expression)?.asset ?? "",
        );
      }
    }
  }
  for (const c of w.characters.filter(
    (c) => me.role === "gm" || c.owner === me.id || c.public,
  )) {
    refs.add(c.portrait);
    if (me.role === "gm" || c.owner === me.id)
      for (const e of c.expressions) refs.add(e.asset);
  }
  for (const a of w.assets) if (a.preload) refs.add(a.id);
  return refs;
}
export function project(w: World, me: Identity): World {
  if (me.role === "gm") return structuredClone(w);
  const result = structuredClone(w),
    visible = new Set(
      w.characters
        .filter((c) => c.public || c.owner === me.id)
        .map((c) => c.id),
    ),
    refs = referencedAssets(w, me);
  result.characters = result.characters
    .filter((c) => visible.has(c.id))
    .map((c) => {
      c.privateNotes = "";
      if (c.owner !== me.id && c.kind === "npc") {
        c.abilities = [];
        c.classes = [];
        c.bonds = [];
        c.equipment = [];
        c.inventory = [];
        c.loadout = {};
        c.attrs = { dex: 6, ins: 6, mig: 6, wlp: 6 };
        c.overrides = {};
        c.modifiers = { hp: 0, mp: 0, ip: 0, def: 0, mdef: 0, initiative: 0 };
        c.hp = c.mp = c.ip = c.fabula = c.zenit = c.xp = 0;
        c.description = "";
        c.identity = c.theme = c.origin = c.gearNotes = "";
        c.custom = true;
      }
      c.expressions = c.expressions.filter((e) => refs.has(e.asset));
      return c;
    });
  result.scenes = result.scenes
    .filter((s) => s.public && s.id === w.activeScene)
    .map((s) => ({
      ...s,
      folder: "",
      notes: "",
      cues: [],
      cueIndex: -1,
      tokens: s.tokens.filter((t) => !t.hidden && visible.has(t.actor)),
      exploration: s.exploration && {
        ...s.exploration,
        order: s.exploration.order.filter(
          (id) =>
            visible.has(id) &&
            s.tokens.some((t) => t.actor === id && !t.hidden),
        ),
        current:
          visible.has(s.exploration.current) &&
          s.tokens.some((t) => t.actor === s.exploration!.current && !t.hidden)
            ? s.exploration.current
            : "",
        spent: Object.fromEntries(
          Object.entries(s.exploration.spent).filter(
            ([id]) =>
              visible.has(id) &&
              s.tokens.some((t) => t.actor === id && !t.hidden),
          ),
        ),
      },
      cast: s.cast.filter((c) => visible.has(c.actor)),
    }));
  result.assets = result.assets.filter((a) => refs.has(a.id));
  result.gmNotes = "";
  result.clocks = result.clocks.filter(
    (c) =>
      c.public && (!c.scene || result.scenes.some((s) => s.id === c.scene)),
  );
  result.journal = result.journal.filter(
    (entry) => entry.public || entry.author === me.id,
  );
  result.logs = result.logs.filter((l) => !l.private);
  result.battle.roster = result.battle.roster.filter((id) => visible.has(id));
  result.battle.acted = result.battle.acted.filter((id) => visible.has(id));
  if (!visible.has(result.battle.current)) result.battle.current = "";
  if (!visible.has(result.focus)) result.focus = "";
  if (result.speech?.actor && !visible.has(result.speech.actor))
    result.speech = null;
  return result;
}
export function apply(w: World, me: Identity, input: unknown) {
  const a = v.obj(input),
    type = v.str(a.type, 50);
  switch (type) {
    case "character.save": {
      const c = v.character(a.value),
        old = w.characters.find((x) => x.id === c.id);
      expected(old?.revision, a.expected);
      if (old) actor(w, me, c.id);
      else v.insist(w.characters.length < 150, "房间角色已达 150 个");
      if (me.role !== "gm") {
        c.owner = me.id;
        c.kind = "pc";
        c.side = "heroes";
        c.public = true;
        c.privateNotes = old?.privateNotes ?? "";
        if (old) {
          for (const k of ["hp", "mp", "ip", "fabula", "zenit", "xp"] as const)
            c[k] = old[k];
        } else {
          Object.assign(c, {
            hp: derived(c).hp,
            mp: derived(c).mp,
            ip: derived(c).ip,
            fabula: 3,
            zenit: Math.max(0, 500 - derived(c).cost),
            xp: 0,
          });
        }
      }
      if (!c.custom) {
        v.insist(
          Object.values(c.attrs).every((n) => [6, 8, 10, 12].includes(n)),
          "标准属性只能为 d6、d8、d10 或 d12",
        );
        v.insist(
          c.classes.every((x) => x.level <= 10),
          "单个职业最多 10 级",
        );
      }
      v.insist(
        !c.owner || w.members.some((m) => m.id === c.owner),
        "持有人不存在",
      );
      checkAssets(w, [c.portrait, ...c.expressions.map((e) => e.asset)]);
      if (old && !c.public) requireExplorationFinished(w, c.id);
      for (const choice of c.classes) {
        const definition = CLASSES.find((k) => k.id === choice.id);
        if (
          definition?.expansion &&
          !old?.classes.some((k) => k.id === choice.id)
        )
          v.insist(
            w.expansions?.includes(definition.expansion),
            "世界尚未启用这个职业的扩展",
          );
      }
      for (const ability of c.abilities) {
        const r = expansionResources[ability.id];
        if (r && !old?.abilities.some((a) => a.id === ability.id))
          v.insist(w.expansions?.includes(r), "世界尚未启用这个资源的扩展");
      }
      const problems = characterProblems(c, !old);
      v.insist(!problems.length, problems.join("；"));
      c.revision = (old?.revision ?? -1) + 1;
      if (old) w.characters[w.characters.indexOf(old)] = c;
      else w.characters.push(c);
      addLog(w, me, "system", old ? "更新了角色卡" : "加入了故事", c);
      break;
    }
    case "character.delete": {
      const c = actor(w, me, v.id(a.id));
      w.characters = w.characters.filter((x) => x.id !== c.id);
      w.battle.roster = w.battle.roster.filter((id) => id !== c.id);
      w.battle.acted = w.battle.acted.filter((id) => id !== c.id);
      if (w.battle.current === c.id) w.battle.current = "";
      if (!w.battle.roster.length) w.battle.active = false;
      for (const s of w.scenes) {
        s.cast = s.cast.filter((x) => x.actor !== c.id);
        s.tokens = s.tokens.filter((x) => x.actor !== c.id);
        s.cues = s.cues.filter((x) => x.actor !== c.id);
        s.cueIndex = Math.min(s.cueIndex, s.cues.length - 1);
        if (s.exploration) {
          s.exploration.order = s.exploration.order.filter((id) => id !== c.id);
          delete s.exploration.spent[c.id];
          if (s.exploration.current === c.id)
            s.exploration.current = s.exploration.order[0] ?? "";
          if (!s.exploration.order.length) s.exploration.active = false;
        }
        s.revision++;
      }
      if (w.focus === c.id) w.focus = "";
      if (w.speech?.actor === c.id) w.speech = null;
      addLog(w, me, "system", `删除了人物：${c.name}`, c);
      break;
    }
    case "resource": {
      const c = actor(w, me, v.id(a.id)),
        key = v.one(a.resource, ["hp", "mp", "ip", "fabula", "zenit"] as const);
      if (key === "hp") gm(me);
      const delta = v.int(a.delta, -99999, 99999),
        reason = v.str(a.reason, 300);
      const before = c[key],
        after = before + delta;
      v.insist(after >= 0, "资源不足；如需归零，请输入当前数量");
      v.insist(after <= 1000000, "资源超过上限");
      c[key] = after;
      c.revision++;
      if (key === "fabula" && delta < 0) w.fabulaSpent -= delta;
      addLog(
        w,
        me,
        "action",
        `${{ hp: "HP", mp: "MP", ip: "IP", fabula: "物语点", zenit: "泽尼特" }[key]} ${before} → ${after}${reason ? " · " + reason : ""}`,
        c,
      );
      break;
    }
    case "scene.save": {
      gm(me);
      const s = v.scene(a.value),
        old = w.scenes.find((x) => x.id === s.id);
      expected(old?.revision, a.expected);
      v.insist(!!old || w.scenes.length < 80, "场景已达 80 个");
      checkScene(w, s);
      preserveExploration(old, s);
      if (s.id === w.activeScene) s.public = true;
      s.revision = (old?.revision ?? -1) + 1;
      if (old) w.scenes[w.scenes.indexOf(old)] = s;
      else w.scenes.push(s);
      break;
    }
    case "scene.open": {
      gm(me);
      const s = w.scenes.find((s) => s.id === v.id(a.id));
      v.insist(s, "场景不存在");
      v.insist(
        s.mode !== "map" || !w.battle.active,
        "请先结束冲突，再打开探索地图",
      );
      s.public = true;
      s.revision++;
      w.activeScene = s.id;
      w.focus = "";
      w.speech = null;
      addLog(w, me, "system", `场景：${s.name}`);
      break;
    }
    case "scene.delete": {
      gm(me);
      const id = v.id(a.id);
      const removed = w.scenes.find((s) => s.id === id);
      v.insist(removed, "场景不存在");
      w.scenes = w.scenes.filter((s) => s.id !== id);
      w.clocks = w.clocks.filter((c) => c.scene !== id);
      if (id === w.activeScene) {
        const replacement = newScene(randomUUID());
        replacement.name = "空白舞台";
        replacement.public = true;
        w.scenes.push(replacement);
        w.activeScene = replacement.id;
        w.focus = "";
        w.speech = null;
        w.battle.active = false;
        w.battle.current = "";
        w.battle.roster = [];
        w.battle.acted = [];
      }
      addLog(w, me, "system", `删除了场景：${removed.name}`, undefined, {
        private: !removed.public,
      });
      break;
    }
    case "asset.delete": {
      gm(me);
      const id = v.id(a.id),
        removed = w.assets.find((x) => x.id === id);
      v.insist(removed, "世界素材不存在");
      w.assets = w.assets.filter((x) => x.id !== id);
      for (const c of w.characters) {
        const expressions = new Set(
          c.expressions.filter((e) => e.asset === id).map((e) => e.id),
        );
        if (c.portrait === id || expressions.size) {
          if (c.portrait === id) c.portrait = "";
          c.expressions = c.expressions.filter((e) => e.asset !== id);
          c.revision++;
          for (const s of w.scenes) {
            let changed = false;
            for (const x of [...s.cast, ...s.cues])
              if (x.actor === c.id && expressions.has(x.expression)) {
                x.expression = "";
                changed = true;
              }
            if (changed) s.revision++;
          }
        }
      }
      for (const s of w.scenes)
        if (s.background === id || s.audio === id) {
          if (s.background === id) s.background = "";
          if (s.audio === id) s.audio = "";
          s.revision++;
        }
      // Content-addressed files may be shared by other worlds; revoke only this world's reference.
      addLog(w, me, "system", `删除了世界素材：${removed.name}`, undefined, {
        private: true,
      });
      break;
    }
    case "token.move": {
      const s = w.scenes.find((s) => s.id === v.id(a.scene));
      v.insist(s, "场景不存在");
      v.insist(
        me.role === "gm" || (s.id === w.activeScene && s.public),
        "场景未开放",
        403,
      );
      const t = s.tokens.find((t) => t.id === v.id(a.token));
      v.insist(t, "Token 不存在");
      v.insist(me.role === "gm" || !t.hidden, "Token 未开放", 403);
      actor(w, me, t.actor);
      if (s.mode === "map") moveOnGrid(w, me, s, t, a);
      else {
        t.x = v.num(a.x, 0, 100);
        t.y = v.num(a.y, 0, 100);
      }
      s.revision++;
      break;
    }
    case "exploration.start":
    case "exploration.endTurn":
    case "exploration.stop":
      updateExploration(w, me, a, type);
      break;
    case "stage.cast": {
      gm(me);
      const s = current(w),
        c = actor(w, me, v.id(a.actor));
      if (v.bool(a.present)) {
        v.insist(c.public, "请先将角色设为公开");
        if (!s.cast.some((x) => x.actor === c.id)) {
          v.insist(s.cast.length < 6, "舞台最多同时容纳 6 人");
          const position =
            a.position === undefined
              ? [0, 1, 2, 3, 4, 5].find(
                  (p) => !s.cast.some((x) => x.position === p),
                )!
              : v.int(a.position, 0, 5);
          v.insist(
            !s.cast.some((x) => x.position === position),
            "该站位已有人",
          );
          s.cast.push({ actor: c.id, expression: "", position });
        }
      } else {
        s.cast = s.cast.filter((x) => x.actor !== c.id);
        if (w.focus === c.id) w.focus = "";
        if (w.speech?.actor === c.id) w.speech = null;
      }
      s.revision++;
      break;
    }
    case "stage.focus": {
      gm(me);
      const id = a.actor === "" ? "" : v.id(a.actor);
      v.insist(
        !id || current(w).cast.some((x) => x.actor === id),
        "角色尚未登台",
      );
      w.focus = id;
      w.speech = null;
      break;
    }
    case "stage.expression": {
      gm(me);
      const s = current(w),
        slot = s.cast.find((x) => x.actor === v.id(a.actor));
      v.insist(slot, "角色尚未登台");
      const c = actor(w, me, slot.actor),
        expression = a.expression === "" ? "" : v.id(a.expression);
      v.insist(
        !expression || c.expressions.some((e) => e.id === expression),
        "表情不存在",
      );
      slot.expression = expression;
      s.revision++;
      break;
    }
    case "chat": {
      const text = v.str(a.text, 4000).trim();
      v.insist(text, "请填写聊天内容");
      const channel =
        a.channel === undefined
          ? "ooc"
          : v.one(a.channel, ["ic", "ooc"] as const);
      const c = channel === "ic" ? actor(w, me, v.id(a.actor)) : undefined;
      v.insist(!c || c.public, "私密角色不能向全团发言");
      addLog(w, me, "chat", text, c, { channel });
      break;
    }
    case "say": {
      const text = v.str(a.text, 4000).trim();
      v.insist(text, "请填写台词");
      const c = a.actor ? actor(w, me, v.id(a.actor)) : undefined;
      if (!c) gm(me);
      v.insist(!c || c.public, "私密角色不能向全团发言");
      w.focus = c?.id ?? "";
      w.speech = {
        actor: c?.id ?? "",
        name: c?.name ?? "旁白",
        text,
        id: randomUUID(),
      };
      addLog(w, me, "speech", text, c);
      break;
    }
    case "cue": {
      gm(me);
      const s = current(w),
        index = v.int(a.index, 0, s.cues.length - 1),
        cue = s.cues[index],
        c = cue.actor ? actor(w, me, cue.actor) : undefined;
      v.insist(!c || c.public, "台词角色尚未公开");
      if (c) {
        const slot = s.cast.find((x) => x.actor === c.id);
        v.insist(slot, "请先让台词角色登台");
        if (cue.expression) {
          v.insist(
            c.expressions.some((e) => e.id === cue.expression),
            "表情不存在",
          );
        }
        slot.expression = cue.expression;
      }
      s.cueIndex = index;
      s.revision++;
      w.focus = c?.id ?? "";
      w.speech = {
        actor: c?.id ?? "",
        name: c?.name ?? "旁白",
        text: cue.text,
        id: randomUUID(),
      };
      addLog(w, me, "speech", cue.text, c);
      break;
    }
    case "roll": {
      const c = a.actor ? actor(w, me, v.id(a.actor)) : undefined;
      const sides = v.list(a.sides, (n) => v.int(n, 2, 100), 20);
      v.insist(sides.length > 0, "请选择骰子");
      const modifier = v.int(a.modifier, -999, 999),
        label = v.str(a.label, 100),
        values = sides.map((n) => randomInt(1, n + 1));
      addLog(
        w,
        me,
        "roll",
        `${label || "掷骰"}：${values.map((n, i) => `d${sides[i]} → ${n}`).join(" ＋ ")}${modifier ? "，修正 " + modifier : ""}；合计 ${values.reduce((n, x) => n + x, modifier)}`,
        c,
        { roll: { sides, values, modifier } },
      );
      break;
    }
    case "declare": {
      const c = actor(w, me, v.id(a.actor)),
        ability = learnedAbilities(c).find(
          (x) => x.id === v.str(a.ability, 100),
        );
      v.insist(ability, "能力不存在");
      addLog(
        w,
        me,
        "action",
        `使用「${ability.name}」\n${ability.text}\n消耗：${ability.cost}（另行掷骰与调整资源）`,
        c,
      );
      break;
    }
    case "battle.basic": {
      const c = actor(w, me, v.id(a.actor));
      const action = v.one(a.action, ["攻击", "防御", "物品"] as const);
      const item = a.item ? v.str(a.item, 100) : "";
      addLog(
        w,
        me,
        "action",
        `声明「${action}」${item ? `：${item}` : ""}；掷骰、效果和资源由玩家与 GM 手动处理。`,
        c,
      );
      break;
    }
    case "clock.save": {
      gm(me);
      const c = v.clock(a.value),
        i = w.clocks.findIndex((x) => x.id === c.id);
      v.insist(i >= 0 || w.clocks.length < 40, "命刻过多");
      v.insist(c.name, "请填写命刻名称");
      if (c.scene)
        v.insist(
          w.scenes.some(
            (s) =>
              s.id === c.scene &&
              (s.mode === "battle" ||
                (s.id === w.activeScene && w.battle.active)),
          ),
          "请选择冲突场景",
        );
      if (i >= 0) c.value = Math.min(w.clocks[i].value, c.segments);
      if (!c.public || c.archived) c.primary = false;
      if (i < 0) w.clocks.push(c);
      else w.clocks[i] = c;
      break;
    }
    case "clock.primary": {
      gm(me);
      const c = w.clocks.find((c) => c.id === v.id(a.id));
      v.insist(c && c.public && !c.archived, "请选择公开且未归档的命刻");
      c.primary = true;
      break;
    }
    case "clock.set":
    case "clock.tick": {
      gm(me);
      const c = w.clocks.find((c) => c.id === v.id(a.id));
      v.insist(c, "命刻不存在");
      v.insist(!c.archived, "请先恢复这个命刻再调整");
      const before = c.value;
      c.value =
        type === "clock.set"
          ? v.int(a.value, 0, c.segments)
          : Math.max(
              0,
              Math.min(c.segments, c.value + v.int(a.delta, -12, 12)),
            );
      addLog(
        w,
        me,
        "system",
        `命刻「${c.name}」：${before} → ${c.value}/${c.segments}`,
        undefined,
        {
          private:
            !c.public ||
            (!!c.scene && !w.scenes.find((s) => s.id === c.scene)?.public),
          channel: c.scene ? "combat" : "system",
        },
      );
      break;
    }
    case "journal.save":
    case "journal.archive":
      updateJournal(w, me, type, a);
      break;
    case "clock.delete":
      gm(me);
      w.clocks = w.clocks.filter((c) => c.id !== v.id(a.id));
      break;
    case "battle.start": {
      gm(me);
      const roster = v.unique(v.list(a.roster, (x) => v.id(x), 100));
      v.insist(roster.length > 0, "请选择参与者");
      const participants = roster.map((id) => actor(w, me, id));
      v.insist(
        participants.every((c) => c.public),
        "冲突参与者需要公开",
      );
      v.insist(
        participants.some((c) => c.side === "heroes") &&
          participants.some((c) => c.side === "foes"),
        "双方都需要参与者",
      );
      const first = v.one(a.first, ["heroes", "foes"]);
      w.battle = {
        active: true,
        round: 1,
        first,
        side: first,
        acted: [],
        roster,
        current: "",
      };
      addLog(w, me, "action", "冲突开始，由 GM 确认行动、伤害与效果");
      break;
    }
    case "battle.select": {
      gm(me);
      const c = actor(w, me, v.id(a.actor)),
        b = w.battle;
      v.insist(
        b.active &&
          b.roster.includes(c.id) &&
          !b.acted.includes(c.id) &&
          c.side === b.side,
        "请选择当前一方尚未行动的角色",
      );
      b.current = c.id;
      addLog(w, me, "action", `第 ${b.round} 轮 · 开始行动`, c);
      break;
    }
    case "battle.endTurn": {
      gm(me);
      const b = w.battle;
      v.insist(b.active && b.current, "请先选择本回合行动者");
      addLog(
        w,
        me,
        "action",
        `第 ${b.round} 轮 · 结束行动`,
        w.characters.find((c) => c.id === b.current),
      );
      b.acted.push(b.current);
      b.current = "";
      if (b.acted.length === b.roster.length) {
        b.round++;
        b.acted = [];
        b.side = b.first;
      } else {
        const other = b.side === "heroes" ? "foes" : "heroes";
        if (
          b.roster.some(
            (id) =>
              !b.acted.includes(id) &&
              w.characters.find((c) => c.id === id)?.side === other,
          )
        )
          b.side = other;
      }
      break;
    }
    case "battle.nextRound":
      gm(me);
      v.insist(w.battle.active && !w.battle.current, "请先结束当前行动");
      w.battle.round++;
      w.battle.acted = [];
      w.battle.side = w.battle.first;
      addLog(w, me, "action", `GM 开始第 ${w.battle.round} 轮`);
      break;
    case "battle.stop":
      gm(me);
      w.battle.active = false;
      w.battle.current = "";
      addLog(w, me, "action", "冲突结束");
      break;
    case "asset.preload": {
      gm(me);
      const asset = w.assets.find((x) => x.id === v.id(a.id));
      v.insist(asset, "素材不存在");
      asset.preload = v.bool(a.value);
      break;
    }
    case "notes":
      gm(me);
      w.gmNotes = v.str(a.text, 50000);
      break;
    default:
      throw new v.UserError("未知操作");
  }
  w.revision++;
  return w;
}
