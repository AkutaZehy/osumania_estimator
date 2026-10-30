# osumania_estimator 面板术语表

## 用途

对本仓库中所出现的术语进行最终解释，以避免与通配的术语产生混淆。

在写 README、面板文案、文档、commit 涉及术语前，先读本表对齐译法与口径。

语言约定：本表是仓库里唯一允许中文的文件。README、docs/ALGORITHM.md、CHANGELOG 与代码注释一律英文；中文叫法只在本表出现。

算法定义来源：`src/custom/*.ts` 当前实现；与测试表的口径差异在注释中标明。

部分主流译法参见：[vsrg-en-to-zh common.md](https://github.com/inuiyumegan/vsrg-en-to-zh-localization-reference/blob/main/common.md) 

---

## 体系名词（英文名 + 代码名）

中文叫法只在本表出现。英文文档（README / ALGORITHM / CHANGELOG / 代码注释）一律用下表 English 列；代码标识符可保留下表 Code 列的历史名字，不再重命名。

| 中文 | English | Code | 说明 |
|---|---|---|---|
| 大勿段 / 勿段 | wds0 Dan | `computeWdsMarker` | wds0 的作品体系；wds0 为人名，保持首字母小写 |
| 切 | stream | — | 切系 = stream family |
| 连4 / 连 4 | bullet-4 | `findLian4` | 同列 4 连序列；代码名保留拼音 |
| x连 | x-bullet | 链长字段 | 同列连续链接的长度，如 4 连 = bullet-4 |
| 间隔0 … 间隔4+ | interval(0) … interval(4+) | `bucket[0..4]` | interval(4+) 是开区间（gap ≥ 4） |
| 非整数 | off-grid | `bucket[5]` | 不在任何合格 cadence 网格上的间隔 |
| 分度 | subdivision | `sf16` / `sh16` | 英文举例直接写音符值（8th / dotted 8th / quarter） |
| 键型 / 主键型 / 键型条 | pattern / dominant pattern / pattern bars | `keyType` / `bpmKeyTypes` | 代码标识符保留 keyType |
| 叠切切换频率 | jack/stream switch frequency | `gridSwitch` | |

---

## 键型表 / Pattern table（BPM / DENSITY 上方主显示区）

英文名：键型 = pattern，主键型 = dominant pattern，键型条 = pattern bars。

顶行显示 `{BPM} {主键型}`：
1. 主键型取 bpmKeyTypes 聚合后的主导非 LN 键型；
2. 面占比 ≥15% 时可被 LN Pool 全名覆盖；
3. Vibro 判定时整行替换为 `Vibro`。

下方键型条（pattern bars）列出各键型占比与其等效 BPM（最多 8 条）。缩写规则：Chordjack→CJ、Jumpstream→JS、Handstream→HS；Minijack 与 Single Stream 保持全称。

键型判定流程：
1. 谱面按拍切格（cell）；
2. 逐格检测分度并归类 jack / stream / ln / break，同类连续格并段；
3. 段内 4×4 网格算密度定键型；
4. 键型按 BPM ±10 合并算占比。

### Jack（叠系）

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| CJ | Chordjack | （协调）叠 | 协调叠系段落总称 | 键型条缩写 CJ；档位带 Low/Mid/High 前缀 |
| High CJ | High Chordjack | 大叠 | 网格总音符数 >10 | |
| Mid CJ | Mid Chordjack | 中叠 | 网格总音符数 ≤10 | |
| Low CJ | Low Chordjack | 小叠 | 网格总音符数 ≤7 | |
| Minijack | Minijack | 子弹 / 速叠 | 网格总音符数 ≤5，即协调要求较低的叠形 | tech 段内同形态重标为 Jacky Tech |

### Stream（切系）

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| JS | Jumpstream | 双押切 | 段内平均行密度 >1.25（Low）/ >1.5（High）/ ≥2.0（Full） | 平均行密度 = 网格总音符 ÷ 4 行 |
| HS | Handstream | 三押切 | 平均行密度 ≥1.75（High）/ ≥2.0（Full） | |
| SS | Single Stream | 单乱 | run 级键型判定为纯单点流；也作 streamClass 的 Singles 档显示 | 键型条可出现 `SS 34%` 这类占比 |

### Tech（技系）

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Technical | Technical | 技巧 / 技 | tech 段的总类别 | |
| Jacky Tech | Jacky Tech | 叠技 | tech 段内 Minijack 形态重标 | 排列倾向叠键 |
| Speedy Tech | Speedy Tech | 乱技 | tech 段内 Rolls / Minitrills 形态重标 | 排列倾向切键 |
| Rolls | Rolls | 滚键 | 单点流区间内同向连续 run（≥2 键）的形态 | |
| Minitrills | Minitrills | 小交互 | 单点流区间内两列交替的 trill 形态 | |

### LN（面条系）

**总称**

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| LN | Long Note | 长键 / 面条 | osu 格式 noteTypes 位 128 | 通用译法沿用 common.md |
| Rice | Rice | 米（单键） | 区别于 LN，没有放手判定 | |
| Tap LN | Tap LN | 短面 | 时长 ≤16 分音符的 LN | 严格面占比将其剔除（视为米） |
| WC | Wildcard | 散点 | 无法被划入 CO、TE、DE 的，具有较多面的构造 | |

**键型**

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| LN Inverse | LN Inverse | 反键 | 段内 inverse 模式 ≥20% | |
| Timing Hell | Timing Hell（release hell） | 放手 | overlay ≥30% 且 AR 模式 ≥20% | 内部键名 releasehell |
| Density | Density（tap LN hell） | 密度 | 段内 tap LN ≥40% | |
| Ouroboros | Ouroboros | 衔尾蛇（严格） | 段内 ouroboros 模式 ≥30% | 该词是本仓库中自用的生造词，没有其他的地方会用到它 |
| LN Tree | LN Tree | 树 | 段内 tree 模式 ≥1 处 | 该词是本仓库中自用的生造词，没有其他的地方会用到它 |
| Speedy WC | Speedy Wildcard | 面乱 | 段内 speedyWC ≥50% | jackyWC / speedyWC 同时驱动顶行 `· Jacky/Speedy` 后缀 |
| Jacky WC | Jacky Wildcard | 面叠 | 段内 jackyWC ≥20% | |
| Shield | Shield | 盾 | 普通音符紧贴 LN 头部（normal→LN head） | |
| Reverse Shield | Reverse Shield | 反盾 | LN 尾后 ≤¼ 拍同列接普通音符（LN tail→normal） | |
| Unknown LN | Unknown LN | 未知 LN | 未命中任何 LN 子类型阈值 | |

### Break（休息段）

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Break | Break | 休息段 | 段内无音符 | 段条深灰 |

### Vibro（秒杀）

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Vibro | Vibro | 秒杀 / vibro | bullet-4 序列检测 + canVibro 速率按 S/H/F/C 分型，verdict = vibro 时顶行替换为 `Vibro` | 代码名 `findLian4`；详细标签见 JACK 面板 Vibro 行 |

### 顶部其余字段

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| BPM | Beats Per Minute | 曲速 | 首个继承 timing point；有变速区间时显示 `BPM (min-max)` | 区间来自 grid 分析 |
| Sunny | Sunny Rework Star | Sunny 星数| `calculateSunny(text, 1, ModFlags)`；无结果时回退密度星 =(max×0.6+median×0.4)/5 | 括号内是与游戏内星数的偏差百分比 |
| K | Key Count | 键数 | columnCount | 当 K 不为 4 时不再计算，本仓库算法仅面向 4K |
| LN Ratio | LN Ratio | 面占比 | meta.lnRatio<br>≥1% 时按小节统计附 `· Jacky`（jackyWC≥20 占优）或 `· Speedy`（speedyWC≥50 占优） | |
| LN Pool 覆盖 | Dominant LN Pool | 图池类型（面） | lnRatio ≥15% 时顶行键型替换为四图池最高分全名（Coordination / Density / Wildcard / Technical） | 图池分 <15 分不参与覆盖 |

---

## BPM / DENSITY 面板

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| BPM | Beats Per Minute | 曲速 | computeBPM 取整 | 与顶行一致 |
| Both | Both-hands Density | 双手密度 | 1s 滑窗音符数，`avg 均值 / max 峰值`，mod 后时间轴（×speedRate） | 单位键/秒 |
| L/R | Per-hand Density | 左右手密度 | 列 0-1（左）与列 2-3（右）各自 1s 滑窗均值 | |
| Cols | Per-column Density | 各列密度 | 四列各自 1s 滑窗均值，`a \| b \| c \| d` | 仅 4K 显示 |

---

## LONG NOTE 面板

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Ratio | LN Ratio (strict) | 面占比（严格） | `总% (严格%)`；严格占比剔除 ≤16 分音符的 tap LN | |
| Overlap | Overlapping LN | 面条重叠率 | 同期压着的 LN 对数（占总 LN %） | |
| Tap LN | Tap LN | 短面 | ≤16 分音符时长 LN 的计数 | |
| P-Score | LN Pool Scores | 图池分 | 四图池 0–100，各分量为每-LN 百分比，计算方法见各自公式 | 统一分母（每-LN 占比）保证四图池可在 argmax 直接比较<br>该分值仅显示图池间相对概率，不显示难度 |
| CO | Coordination Pool | 协调 | CO = 0.5·ov + 0.2·i + 0.3·c | ov=重叠参与、i=反键、c=列锁（LN 体贴邻列 ≥2 音符） |
| DE | Density Pool | 密度 | DE = 0.65·i + 0.2·ch + 0.15·tp | i=反键、ch=多押面头、tp=短面 |
| WC | Wildcard Pool | 散点 | WC = 0.45·wj + 0.45·ws + 0.1·s | wj=面头叠（相邻面头行共享列且 dt≤一拍）、ws=面头乱（dt≤半拍且行区间不相交）、s=盾 |
| TE | Technical Pool | 技巧 | TE = 0.5·rel + 0.2·r + 0.15·s + 0.15·c | rel=同尾交错放手（同尾组 ≥2 LN 异头）、r=异步放手对、c=列锁 |

---

## JACK 面板

### Grade

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Grade | Jack Density Grade | 叠密度档 | 各叠段网格总音符数的加权 P90，括号 `P90/P50`<br>无 grid 数据时回退 4 行滑窗档（同阈值，括号 `max/med`） | Mini ≈ 子弹密度 |
| Mini | Minijack | 子弹 / 速叠 | ≤4 Mini | |
| Low | Low Chordjack | 小叠 | ≤7 Low | 接近 2-2-2-2 |
| Mid | Mid Chordjack | 中叠 | ≤11 Mid | 接近 3-2-3-2 |
| Dense | Dense Chordjack | 大叠 | >11 Dense | 超过 3-3-3-3 |

### Class

**叠分类**：`{eff} {类型}`

- 连（link）= 相邻行共享同列
- 簇 = 间隔 ±15% 贪心（主导簇 + 份额 ≥10% 且 eff≥60 的次簇）
- 链 = 同列 x-bullet（连续链接长度）
- streak = 主导 cadence 上的连续叠行流（容忍单次非叠转换）

经由 47 图标定，按照分类法，使用下述 5 种术语。

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Speedjack | Speedjack | 高速叠 | 通用条件（run 键/秒 ≥4.5 且峰值 ≥6.5）不达、但 streak 覆盖达标的形态 | |
| Bullet / Minijack | Bullet / Minijack | 子弹 / 速叠 | ≥3 连键占比 <15% 时的标注 | |
| Chordjack（Low/Mid/High） | Chordjack | 协调叠 | run 键/秒 <8 Low、<15 Mid、≥15 High（谱级 run 密度，与键型表网格密度阈值不同源） | |
| Anchor / X Chordjack | Anchor | 锚键 | anchorConf = k5 份额 × 平均链深 × 5+ 链存在 三因子乘积 ≥70 时加 `Anchor /` 前缀 | |
| Actually Not Jack | Actually Not Jack | 非叠 | 音符 <20 或无合格 cadence 簇，或通用+覆盖条件双不达 | |

### Stamina

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Stamina | Jack Stamina | 叠耐力 | `{最长段秒}s ({段内音符}[, Broken]) / {全段合计秒}s ({合计音符})`<br>最长段允许半小节间隔无条件合并，时长与音符累积、间隔不计 | Broken = 单段 <10s 合并后越过 10s 的标记；改显示格式须同步 `src/ui/display.ts` |

### Imbal 4c/16c

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Imbal 4c/16c | Hand Imbalance (16/64-row windows) | 左右失衡度 | 16 行 / 64 行窗内叠键左右手计数比 2·max/(L+R)，取 top 25% 窗口均值<br>全部叠键集中于单手时显示 `bias L/R/S`（L=左偏 R=右偏 S=交替失衡） | 1.0 均衡，2.0 全偏 |

### wds0-like

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Gluts | Gluts | 搯键 | hand 规则（三押 ≥20%）触发的 `-W` 后缀形态 | MR-Jack-W 即最标准的 Gluts；在本仓库中泛指手感接近 2-2-2-2 的标准耐叠 |

**wds0 Dan marker — Jack（大勿段式标记，叠）**：`XY-Jack[-W]`
- X = 叠池 P90 密度位（键/s）：S<8 / M<10 / L<12 / H≥12
- Y = manip 位 F/R/P
  - delta = 链式锚值 
  - A − spike-min（<0.005→F、>0.01→P、其余 R；A>1.11 或无 delta 回退 A 线 1.10/1.09）
  - F=可糊 Flat、R=一般 Rolling、P=难糊 Peak（大勿原版字母）
- \[-W\] = 构造叠，三押行 ≥20%（分母=全部行）→ 强制 R + `-W`

图级 family = 锁 1≥10% 判主 jack 图，主 jack 图叠池=全部节。

### Finger / Hand

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Finger | Single-finger Pressure | 单指压力 | 4 × 最高列峰值密度 ÷ 双手峰值密度 | 1.0 = 均衡（每列 25%），4.0 = 全在一列 |
| Hand | Single-hand Pressure | 单手压力 | 2 × 最高手峰值密度 ÷ 双手峰值密度 | 1.0 = 均衡，2.0 = 全单手 |

### Vibro

**Vibro 判定**：同列 4+ 连续音符序列（bullet-4）检测，代码名 `findLian4`

- canVibro = 同手邻列在该序列格点上成对补位（pattern 校验，权值 = valid/total）

按照 `canVibro` 的计算结果，使用以下术语。

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| No Vibro | No Vibro | 不能 Vibro | 无 bullet-4 | |
| Vibro Suspicious | Vibro Suspicious | 可能能 Vibro | 有 bullet-4 但不达标 | |
| Vibro | Vibro | 能 Vibro | canVibro 加权率 >35% 且 BPM ≥150 且至少一类达标 | `Vibro(rate%) B x.xs/C x.xs`<br> | 判定成立时顶行同步替换 |

具体分为 S/H/F/C 四类，它们仅参与 Vibro 判定计算，不显示。

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| S | Single Finger | 单指 Vibro | n≥5 且率>50% | 只包含有一个手指的 Vibro（子弹） |
| H | Hand | 单手 Vibro | n≥5 且率>60% | 包含有单手的 Vibro（拍拍乐） |
| F | Full | 满 Vibro | n≥10 且率>50% | 四列上全是键的 Vibro（满锚）|
| C | Common | 其他常见 Vibro | n≥5 且率>70% | 其余 Vibro，如三列上是键的 Vibro、并不分在同一只手上的 Vibro 等|

具有两个计算指标，显示 `B x.xs/C x.xs` = 两类 bullet-4 各自覆盖的总时长，仅 verdict=vibro 时显示：

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| B(VB) | Vibro Burst (Time) | 爆发 | B（爆发）= 纯单列 bullet-4，或他列与主列同格对齐（步长偏移 <15% / >85% 占优） | 整齐的 Vibro（V 速） |
| C(VC) | Vibro Control (Time) | 控制 | C（控制）= 他列错位补在半步附近（步长偏移 35–65% 占优） | 歪的 Vibro（打准） |

## STREAM 面板

### Grade

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Grade | Stream Density Grade | 切密度档 | 各切段平均行密度（剔除稀疏段）分档，括号 `均值`<br>回退 4 行滑窗档 | 跳过叠行 |
| Single | Single Stream | 乱 | ≤1.125 Single | 包括单乱（=1）和大乱（1~1.125） |
| Light | Light Jumpstream/Handstream | 轻切 | ≤1.25 Light | |
| Mid | Mid Jumpstream/Handstream | 中切 | ≤1.5 Mid | |
| Dense | Dense Jumpstream/Handstream | 强切 | <2.0 Dense | |
| Full/Heavy | Full/Heavy Jumpstream/Handstream | 满切 | =2.0 Full | |

### Class

**Stream Class（切分类）**：`{eff} {档} {JS\|HS\|SS}[, Jacky][, Technical]`
- eff：等效 BPM（4 分度）
- 密度前缀
  - interval 桶（k−1，k=dt/C 且链完整）：interval(0)=同列相邻（叠混入）、interval(1)=2C（8 分音符）、interval(2)=3C（附点 8 分）、interval(3)=4C（4 分音符）、interval(4+)=更宽（gap ≥ 4，开区间）、off-grid=不在任何合格 cadence 网格上（bucket 5，即 Technical 标签的 p5）
  - p1≥50 Full
  - 45≤p1<50 且 p1+p2>80 Dense
  - 15≤p1<30 Broken
  - p1<15 Singles
- 装饰后缀
  - p0>1% Jacky
  - p5≥15% Technical
- Singles 档 → SS 无档位词

谐波伪簇靠支配序 k≥2 首匹配 + 链断裂跳过规避。

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Broken | Broken Stream | 碎切 | 15≤p1<30 Broken | 包含有较多空行的、不连续的切 |
| Jacky | Jacky Stream | 切叠 | p0>1% Jacky | 包含有较多邻列叠的切 |
| Technical | Technical Stream | 切乱 | p5≥15% Technical | 包含有更多细分度的切 |
| JS / HS / SS | Jumpstream / Handstream / Single Stream | 双押切 / 三押切 / 乱 | 主导网格上行构成：3+ 押 ≥5% → HS；2+ 押 ≥10% → JS；否则 SS | |
| Running Man | Running Man | 跑者 | Full 档 + SS 的专名显示 | 类似于脚谱的风格 |

### Stamina

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Stamina | Stream Stamina（w10/w30） | 切耐 | 任意 10s / 30s 滑窗内最大音符数 `{w10} (10s) / {w30} (30s)` | 滑窗步进为行，非采样 |

### Imbal 4c/16c

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Imbal 4c/16c | Stream Hand Imbalance | 切失衡 | 与 JACK Imbal 同构造（2·max/(L+R)，16/64 行窗 top 25% 均值），统计对象为非叠行音符 | |

### wds0-like（两行：Stream 行 + 无标签 Speed 行）

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| manip | manipulation | 糊键 | 通过锚值定义可糊度 | |

**wds0 Dan marker — Stream（大勿段式标记，切）**：`XY-Stream`
- X = Stream 池 P90 密度位（键/s）：B<4.75（碎）/ S<6 / M<7 / L<7.5 / H≥7.5
- Y = manip 位：链式锚值 A 直套 PDF 阈值：F≥1.11 / 1.11>R≥1.10 / P<1.10

主 stream 图切池=全部节。

**wds0 Dan marker — Speed（大勿段式标记，乱）**：`XY-Speed[-T\|-W]`
- X = Stream 段 P50×2：S<8+1/256 / M<8.5 / L<9.5 / ≥9.5 → O（此时 F/R/P 不显示）
- Y = manip 位：Stream 段每节弹对计数档 F≤1/16 / 1/16<R≤1 / 1<P≤3 / P>3
- 旗标后置
  - T=麻花（子弹密度>3）
  - W=构造（子弹密度≤1/16 且 A<1.115）

### Sta L/R / Sta DH

英文名：SH = `Anchor Stamina — Single Hand`，DH = `Anchor Stamina — Dual Hand`。英文名不含 stream，原因见下方口径说明。

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Sta L/R | Anchor Stamina — Single Hand | 锚切耐力（左/右手） | SH：左/右手各自 1/16 分度位置序列的锚段检测，显示 `P100 / P90=v×n / P50=v×n` | 值单位 = 小节 |
| Sta DH | Anchor Stamina — Dual Hand | 双手切耐力 | DH：四组跨手列对（0+2 / 1+3 / 1+2 / 0+3）各自的位置序列，同上格式 | 桥接容差：gap=1 恒续、gap=2 需后续 4 个连续位置、gap≥3 断<br>P100 用容差，P90/P50 严格 |

口径说明：
- 输入是全部音符起始时间 + LN 结束时间，不经 jack/stream 过滤，叠键混入不打断；
- SH 只要求该手每个 16 分格有击键（手内双押只推进一格）；DH 只要求该对任一列有击键；
- 因此它测的是“持续击键段”，不是切键持续段，也不是长按时长（LN 中段不进格点）；
- 分辨率随主导键型变化：叠类图 SH/DH 用 2× BPM，其余用原 BPM；
- SF（单指档）只计算不显示，供标定。

---

## TECH 面板

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| dtCV | Row-spacing Coefficient of Variation | 行距变异系数 | 活跃段（行距 ≤1s）行距的标准差 ÷ 均值 | 0.2–0.4 = 均匀（流/大叠），0.6+ = 爆发式 tech 节奏；接替已退役的 colEntropy |
| Interval | Single-finger Interval（P10） | 同指最小间隔 | 同列间隔的 P10（剔除 <5ms 和弦），取四列最小值，显示 `{n}ms` | 真物理下限；P10 使 grace 不拖累读数；跨手 grace 不影响 |
| KPS（P90） | Keys per Sustained-second | 持续键速 | 全音符 500ms 滑窗计数的 P90 | 区别于绝对峰值；所有指合计密度 |
| Graces | Grace Notes | 滑键 / 装饰音 | 1/4 拍间隙 < 该格预期间隙 ×55%（cell 感知，只收紧不放宽）或 ≤50ms 绝对阈，且伴随列变化 | |
| Rolls | Rolls | 滚键 | 同向连续 run 按分度键统计，显示 `长度×次数` | |
| Trills | Trills | 快速交互 | 两列交替段按分度键统计，显示 `长度×次数` | |

---

## STAMINA 面板

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Max | Max Density Stretch | 峰值密度段 | `密度×持续秒`：4 行滑窗密度最大值及其维持时长 | |
| Med | Median Density Stretch | 中位密度段 | 中位 4 行密度及最长维持时长 | |
| Med tot | Total Time Above Median | 中位以上总时长 | 密度高于中位段的累计时长（秒） | |
| Ratio | Median Ratio | 主难覆盖率 | 中位以上时长 ÷ 全图时长 | |
| Switch | Switch Frequency | 叠切切换频率 | 16 拍窗（4K 下即 64 行）内 jack↔stream 翻转峰值；grid 分析可用时附档位标签 Steady / Mixed / Rhythmic / Intense | 无饱和：gridSwitch 为 16 拍窗内翻转数（无上限），回退的 switchFrequency 为 16 行窗内翻转数（上限 15）；0 侧 = 纯流/trill |

---

## 段条 / 游戏内条（Section Bar / In-Game Bar）

段条按格（cell）着色显示全曲结构；游戏内条在游玩时显示当前位置段落信息。段类型色：stream 蓝、jack 红、ln 绿、break 深灰；tech 紫 与低密度浅色变体（stream-low / jack-low）为保留字段，当前管线不产出。

| English（abbr.） | English（full name） | 中文译法 | 算法定义 | 注释 |
|---|---|---|---|---|
| Single | Single | 单点段 | stream 段子类型（subType=single） | |
| Jump Stream | Jumpstream | 双押切 | stream 段子类型（js） | |
| Hand Stream | Handstream | 三押切 | stream 段子类型（hs） | |
| Broken JS | Broken Jumpstream | 碎双押切 | stream 段子类型（brokenjs） | |
| Stream n | Bulk Stream | 整段乱 | stream 段子类型（bulk），n 为行押数 | |
| Low CJ / High CJ | Low / High Chordjack | 小叠 / 大叠 | jack 段子类型（cj-low / cj-high） | cj-low 橙色（易误判流），cj-high 红色 |
| Mini Jack | Minijack | 子弹 / 小叠 | jack 段子类型（minijack），绿色（jacky tech） | |
| Long Note | Long Note | 长键 / 面条 | ln 段显示 | |
| Speedy Tech / Jacky Tech | Speedy / Jacky Tech | 乱技 / 叠技 | tech 段子类型（speedy / jacky）——**保留字段**：sectionAnalysis 已不产出 tech 段，游戏内条不会显示 | 实际显示位置在键型表（gridAnalysis 段级重标：Minijack→叠技、Rolls/Minitrills→乱技） |
| Break | Break | 休息段 | break 段显示 | |
| M | Measure index | 小节进度 | `M{x}/{y}`，x = 当前进度所在段序号 | |
| n/s | Notes per Second | 每秒音符 | 段结构均值 ÷ 4，显示 `x.x n/s` | |
