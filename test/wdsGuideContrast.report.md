# 大勿段标记对照 — 12 表

本表是《大勿段游玩指南及标准规范文件》+ 观景台实现的移植后调整版本，非忠实实现：
锚值核心（帐篷失衡 U、多窗 min-A）来自 guanjing-scene 的 spike.js；分带与词表取自《指南》5.4；
再按本仓语料与体感标注本地重校准。与原版的差异（链式锚值、图级 family 密度池、叠糊度 delta 线、
乱密度 Stream 段 P50×2、弹对计数档）详见 test/wdsGuideContrast.test.ts 文件头。

标识含义：
  叠 `XY-Jack[-W]`：X=叠池 P90 密度档（S<8/M[8,10)/L[10,12)/H≥12）；Y=糊度 delta 线
    （<0.005 F / >0.01 P / 其余 R）；hand（三押≥20% 行）= Gults → R + -W 后缀。
  切 `XY-Stream`：X=Stream 池 P90 密度档（B<4.75 碎 / S<6 / M<7 / L<7.5 / H≥7.5）；
    Y=链式锚值直套手册阈值（F≥1.11 / R[1.1,1.11) / P<1.1）。
  乱 `XY-Speed[-T|-W]`：X=Stream 段 P50×2 密度档（S<8+1/256 / M<8.5 / L<9.5；≥9.5 → 前缀 O，
    FRP 不显示）；Y=Stream 段每节弹对计数档（≤1/16 F / (1/16,1] R / (1,3] P / >3 P）；
    -T 麻花（计数>3）/ -W 构造（计数≤1/16 且 A<1.115）后置。
密度单位 = 4 行滑窗均值（主导 cadence 归一的 16 拍节），非手册的键密度/规范密度原文口径。
osu星 = Sunny Rework 1×。段位：reform 1st..10th=1..10, Epsilon=15；regular Reg-N=N, Ex-N=10+N,
Final=20；signicial Stage 0..XIV=0..14, Last Stage=15。

## 叠 Reform Jack（reform dans/jack）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Miracle Chance ~ 1st ~ (Ma | 186 | 2.46 | 1 | 47 Low Chordjack | 93 Mid JS, Jacky | MF-Jack | HF-Stream | O-Speed-W |
| Flashes ~ 2nd ~ (Marathon) | 180 | 3.72 | 2 | Actually Not Jack | 180 SS | SF-Jack | MR-Stream | LP-Speed |
| Dimension Tripper!!!! ~ 3r | 188 | 3.23 | 3 | 94 Speedjack | 94 Full HS | SF-Jack | LF-Stream | O-Speed-W |
| CrossOver ~ 4th ~ (Maratho | 132 | 3.35 | 4 | 66 Speedjack | 132 Mid HS, Jacky | SP-Jack | MR-Stream | O-Speed-W |
| Energy Flower 3007 ~ 5th ~ | 133 | 3.96 | 5 | 133 Bullet / Minijack | 133 Mid JS | SF-Jack | MR-Stream | O-Speed-W |
| Sweet Cherry X ~ 6th ~ (Ma | 135 | 4.76 | 6 | 135 Bullet / Minijack | 135 Full HS, Jacky | SF-Jack | HR-Stream | O-Speed-W |
| Last Chance ~ 7th ~ (Marat | 127 | 4.99 | 7 | 127 Low Chordjack | 127 Mid HS, Jacky | MF-Jack | HR-Stream | O-Speed-W |
| To The Limit ~ 8th ~ (Mara | 260 | 5.81 | 8 | 130 Mid Chordjack | 130 Mid HS, Jacky | MR-Jack-W | HP-Stream | O-Speed-W |
| Can't Take my Eyes ~ 9th ~ | 152 | 5.84 | 9 | 152 Bullet / Minijack | 152 Mid HS, Jacky | MR-Jack | MR-Stream | O-Speed-T |
| The Lost Dedicated ~ 10th  | 134 | 6.58 | 10 | 134 Mid Chordjack | 134 Mid HS, Jacky | LR-Jack-W | HF-Stream | O-Speed |
| Dark Sambaland ~ Alpha ~ ( | 145 | 6.65 | 11 | 145 Mid Chordjack | 145 Mid HS, Jacky | LR-Jack-W | HF-Stream | O-Speed |
| Paradigm Shift ~ Beta ~ (M | 145 | 6.98 | 12 | 145 Mid Chordjack | 145 Full HS | LR-Jack-W | SF-Stream | O-Speed |
| Break ~ Gamma ~ (Marathon) | 286 | 7.59 | 13 | 143 Anchor / High Chordjack | 143 Mid HS, Jacky | LR-Jack-W | HR-Stream | O-Speed-W |
| Aquaris ~ Delta ~ (Maratho | 182 | 7.81 | 14 | 182 Mid Chordjack | 182 Mid HS, Jacky | MR-Jack-W | SR-Stream | O-Speed-W |
| Rose Quartz ~ Epsilon ~ (M | 190 | 8.76 | 15 | 190 High Chordjack | 190 Mid HS, Jacky | LR-Jack-W | HR-Stream | O-Speed-W |

## 叠 Regular Jack（regular dans/jack）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reg-0 Map-1 Ikitoshi ikeru | 174 | 2.52 | 0 | 87 Speedjack | 87 Broken JS, Jacky | SR-Jack | SR-Stream | O-Speed-T |
| Reg-1 Map-1 Rex Incognito  | 145 | 3.52 | 1 | Actually Not Jack | 73 Full JS | SF-Jack | SF-Stream | O-Speed-W |
| Reg-2 Map-1 Stargazer  Mip | 87 | 3.11 | 2 | 87 Low Chordjack | 87 Mid HS, Jacky | MR-Jack-W | BF-Stream | LP-Speed-T |
| Reg-3 Koi Kou Enishi  Dong | 144 | 3.89 | 3 | 144 Bullet / Minijack | 144 Broken JS, Jacky | SF-Jack | MF-Stream | O-Speed-W |
| Reg-4 Umiyuri Kaiteitan  M | 240 | 4.14 | 4 | 120 Bullet / Minijack | 120 Mid HS, Jacky | MR-Jack-W | HF-Stream | O-Speed-W |
| Reg-5 Platinum Disco  mas3 | 121 | 4.68 | 5 | 120 Low Chordjack | 121 Mid HS, Jacky | MR-Jack-W | HF-Stream | O-Speed-W |
| Reg-6 Chocolate Disco  Oek | 128 | 4.71 | 6 | 128 Bullet / Minijack | 128 Mid HS, Jacky | MF-Jack | HF-Stream | O-Speed-W |
| Reg-7 Don't Stop The Music | 132 | 5.21 | 7 | 132 Bullet / Minijack | 132 Mid HS, Jacky | MR-Jack | HR-Stream | O-Speed-W |
| Reg-8 Don't let you down   | 135 | 5.74 | 8 | 135 Low Chordjack | 135 Full HS | MR-Jack-W | HF-Stream | O-Speed-W |
| Reg-9 Kikai Shoujo Gensou  | 260 | 6.03 | 9 | 130 High Chordjack | 130 Mid HS, Jacky | LR-Jack-W | HF-Stream | O-Speed |
| Reg-10 Hiensou  Hinaka_Yuk | 138 | 6.19 | 10 | 138 Mid Chordjack | 138 Mid HS, Jacky | MR-Jack-W | BR-Stream | SF-Speed-W |
| Extra-1 Scorpion Dance  Xi | 134 | 6.19 | 11 | 134 Mid Chordjack | 134 Mid HS, Jacky | LR-Jack-W | BR-Stream | SP-Speed |
| Extra-2 Moments (1.05x)  A | 145 | 6.43 | 12 | 145 Mid Chordjack | 145 Full HS, Jacky | LR-Jack-W | HF-Stream | O-Speed-W |
| Extra-3 Edison (1.15x)  Hi | 153 | 6.79 | 13 | 153 Mid Chordjack | 153 Mid HS, Jacky | MR-Jack-W | BR-Stream | LP-Speed-T |
| Extra-4 ZENITHALIZE  Hinak | 150 | 7.12 | 14 | 150 Mid Chordjack | 150 Mid HS, Jacky | LR-Jack-W | HF-Stream | O-Speed |
| Extra-5 Bring Our Ignition | 165 | 7.09 | 15 | 165 Mid Chordjack | 165 Full HS | MR-Jack-W | HR-Stream | O-Speed-W |
| Extra-6 Defeat awaken batt | 163 | 7.38 | 16 | 163 Mid Chordjack | 163 Mid HS, Jacky | LR-Jack-W | HF-Stream | O-Speed |
| Extra-7 LiFE Garden (1.05x | 156 | 8.22 | 17 | 156 High Chordjack | 156 Mid HS, Jacky | LR-Jack-W | SF-Stream | O-Speed |
| Extra-8 Hayabusa  Hylotl | 172 | 8.51 | 18 | 172 Mid Chordjack | 172 Mid HS, Jacky | LR-Jack-W | HF-Stream | O-Speed-W |
| Extra-9 crazy_tek (DJ Nori | 175 | 8.85 | 19 | 175 High Chordjack | 175 Mid HS, Jacky | LR-Jack-W | HR-Stream | O-Speed-W |
| Extra-Final Infinity Heave | 180 | 9.72 | 20 | 180 High Chordjack | 180 Mid HS, Jacky | HR-Jack-W | BR-Stream | LP-Speed-T |

## 切 Reform Stamina（reform dans/stamina）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tommorow Perfume ~ 1st ~ ( | 170 | 3.45 | 1 | Actually Not Jack | 170 Broken JS | SF-Jack | MF-Stream | O-Speed-T |
| Eternal Drain ~ 2nd ~ (Mar | 149 | 3.60 | 2 | Actually Not Jack | 149 Mid JS | SF-Jack | SP-Stream | O-Speed-T |
| True Blue ~ 3rd ~ (Maratho | 164 | 3.75 | 3 | Actually Not Jack | 164 Broken JS | SF-Jack | SF-Stream | O-Speed |
| Angel Of Darkness ~ 4th ~  | 175 | 4.72 | 4 | Actually Not Jack | 175 Dense JS | SF-Jack | MR-Stream | O-Speed-W |
| Elektric U-Phoria ~ 5th ~  | 180 | 5.26 | 5 | Actually Not Jack | 180 Full HS | SF-Jack | MP-Stream | O-Speed-T |
| M-A ~ 6th ~ (Marathon) | 200 | 5.60 | 6 | Actually Not Jack | 200 Mid JS | SF-Jack | MP-Stream | O-Speed-W |
| Hymn ~ 7th ~ (Marathon) | 215 | 5.63 | 7 | Actually Not Jack | 215 Mid JS | SF-Jack | MR-Stream | LP-Speed-T |
| Anguish ~ 8th ~ (Marathon) | 223 | 6.12 | 8 | Actually Not Jack | 223 Dense JS | SF-Jack | HF-Stream | O-Speed-T |
| Firmament Castle Velier ~  | 117 | 6.23 | 9 | Actually Not Jack | 233 Mid HS | SF-Jack | MR-Stream | O-Speed-T |
| Chandelier ~ 10th ~ (Marat | 226 | 6.54 | 10 | Actually Not Jack | 226 Full JS | MF-Jack | HF-Stream | O-Speed-W |
| LazorBeamz ~ Alpha ~ (Mara | 260 | 6.57 | 11 | Actually Not Jack | 260 Broken JS | SR-Jack | LR-Stream | O-Speed-T |
| Time to Say Goodbye ~ Beta | 250 | 7.09 | 12 | Actually Not Jack | 250 Mid JS | SF-Jack | MR-Stream | O-Speed-W |
| We Luv Lama ~ Gamma ~ (Mar | 252 | 7.40 | 13 | Actually Not Jack | 252 Full JS | SR-Jack | MR-Stream | O-Speed-T |
| Future Dominators ~ Delta  | 273 | 8.00 | 14 | Actually Not Jack | 273 Full HS | SF-Jack | MF-Stream | O-Speed-T |
| Hitsugi to Futago ~ Epsilo | 215 | 8.88 | 15 | Actually Not Jack | 323 Mid JS | SF-Jack | LF-Stream | SP-Speed-T |

## 切 Regular Stream（regular dans/stream）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reg-0 Map-4 White Eternity | 178 | 3.07 | 0 | 44 Speedjack | 89 Full JS | SF-Jack | MF-Stream | O-Speed-W |
| Reg-1 Map-4 KING  dONGsHAO | 166 | 3.28 | 1 | 83 Speedjack | 83 Full HS | SF-Jack | HR-Stream | O-Speed-W |
| Reg-2 Map-4 Mermaid Girl   | 150 | 3.96 | 2 | Actually Not Jack | 150 Full HS, Jacky | SF-Jack | MF-Stream | O-Speed-W |
| Reg-3 Hoshi ga Furanai Mac | 165 | 4.11 | 3 | 83 Speedjack | 165 Mid JS | SF-Jack | HF-Stream | O-Speed-T |
| Reg-4 The Crimson Empire ( | 176 | 4.49 | 4 | Actually Not Jack | 176 Mid JS | SF-Jack | MR-Stream | O-Speed-T |
| Reg-5 Joker  HarKIn | 184 | 5.21 | 5 | Actually Not Jack | 184 Dense JS | SF-Jack | MF-Stream | O-Speed-W |
| Reg-6 unhappy century  ter | 190 | 5.56 | 6 | Actually Not Jack | 192 Full JS | SF-Jack | MF-Stream | O-Speed |
| Reg-7 Valkyrie Revolutia   | 207 | 5.68 | 7 | Actually Not Jack | 207 Dense HS | SF-Jack | MF-Stream | O-Speed |
| Reg-8 Positive Dance Time  | 210 | 5.87 | 8 | Actually Not Jack | 210 Full HS | SF-Jack | LF-Stream | O-Speed-T |
| Reg-9 Unleashed World  Ame | 232 | 6.18 | 9 | Actually Not Jack | 232 Mid HS | SF-Jack | MF-Stream | LF-Speed |
| Reg-10 Spin Eternally  Oek | 222 | 6.15 | 10 | Actually Not Jack | 222 Full HS | SF-Jack | MF-Stream | O-Speed-W |
| Extra-1 Onsoku Uchuu Ryoko | 223 | 6.49 | 11 | Actually Not Jack | 223 Full HS | SF-Jack | MR-Stream | O-Speed-T |
| Extra-2 Frontier Explorer  | 230 | 6.72 | 12 | Actually Not Jack | 230 Full HS | SF-Jack | HP-Stream | O-Speed-W |
| Extra-3 Fin.ArcDeaR  Ameka | 243 | 6.94 | 13 | Actually Not Jack | 243 Dense JS | SF-Jack | MR-Stream | O-Speed-T |
| Extra-4 EVERLASTING HAPPiN | 247 | 6.98 | 14 | 123 Speedjack | 247 Full HS | MF-Jack | HR-Stream | LP-Speed-T |
| Extra-5 Kegare Naki Bara J | 260 | 7.25 | 15 | Actually Not Jack | 260 Mid HS | SF-Jack | MF-Stream | O-Speed-T |
| Extra-6 Synthesized Fortre | 172 | 7.56 | 16 | 129 Low Chordjack | 258 Full HS | MF-Jack | HR-Stream | O-Speed-W |
| Extra-7 Heaven's Fall (1.4 | 280 | 8.26 | 17 | Actually Not Jack | 280 Full HS | SF-Jack | HR-Stream | O-Speed-W |
| Extra-8 CRIMSON FIGHTER (1 | 304 | 8.56 | 18 | Actually Not Jack | 304 Dense HS | SF-Jack | LF-Stream | O-Speed-T |
| Extra-9 Deadly force - Put | 305 | 9.26 | 19 | Actually Not Jack | 305 Full HS | SF-Jack | HF-Stream | O-Speed |
| Extra-Final Runengon  tera | 320 | 9.44 | 20 | Actually Not Jack | 320 Full HS | SF-Jack | LR-Stream | O-Speed-T |

## 乱 Reform Speed（reform dans/speed）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shelter ~ 1st ~ (Marathon) | 100 | 3.17 | 1 | Actually Not Jack | 100 Dense HS | SF-Jack | SF-Stream | O-Speed |
| Snow Storm ~ 2nd ~ (Marath | 180 | 3.51 | 2 | Actually Not Jack | 180 Broken SS | SF-Jack | SF-Stream | O-Speed |
| Entelechia ~ 3rd ~ (Marath | 185 | 3.80 | 3 | Actually Not Jack | 185 SS | SF-Jack | MP-Stream | MP-Speed-T |
| Shannon's Theorem ~ 4th ~  | 175 | 4.11 | 4 | Actually Not Jack | 175 Broken SS, Jacky, Technical | SF-Jack | BP-Stream | MP-Speed |
| Palette GAMMA ~ 5th ~ (Mar | 270 | 4.91 | 5 | Actually Not Jack | 270 SS | SF-Jack | SF-Stream | MR-Speed |
| TDPDG ~ 5th ~ (Marathon) | 240 | 4.82 | 5 | Actually Not Jack | 120 Mid JS | SR-Jack | SR-Stream | LF-Speed-W |
| Luv Lab 22ate! ~ 6th ~ (Ma | 228 | 5.45 | 6 | Actually Not Jack | 228 Mid JS | SR-Jack | MR-Stream | O-Speed |
| SOS ~ 6th ~ (Marathon) | 116 | 5.04 | 6 | Actually Not Jack | 186 Mid JS, Jacky, Technical | SF-Jack | MP-Stream | O-Speed-T |
| Five Five Five Guys ~ 7th  | 139 | 5.37 | 7 | Actually Not Jack | 278 SS | SF-Jack | SR-Stream | LP-Speed |
| Trickstarz ~ 8th ~ (Marath | 204 | 5.80 | 8 | 51 Speedjack | 305 SS | SF-Jack | MR-Stream | MP-Speed-T |
| Disconnected Trance ~ 9th  | 148 | 5.70 | 9 | Actually Not Jack | 296 SS | SF-Jack | SP-Stream | SR-Speed |
| Oh Curry! ~ 10th ~ (Marath | 162 | 6.03 | 10 | Actually Not Jack | 324 SS | SF-Jack | LR-Stream | SR-Speed |
| Makiba ~ Alpha ~ (Marathon | 168 | 6.66 | 11 | Actually Not Jack | 336 SS | SF-Jack | SR-Stream | MF-Speed-W |
| Amber Starlight ~ Beta ~ ( | 185 | 6.82 | 12 | 93 Anchor / Low Chordjack | 370 SS | SF-Jack | HR-Stream | LF-Speed-W |
| Reflec Streamz ~ Gamma ~ ( | 190 | 7.76 | 13 | 95 Speedjack | 380 SS | LF-Jack | HF-Stream | MF-Speed |
| Volcanic ~ Delta ~ (Marath | 191 | 7.90 | 14 | 96 Anchor / Low Chordjack | 382 SS | MF-Jack | HP-Stream | LF-Speed-W |
| Mario Paint ~ Epsilon ~ (M | 155 | 9.08 | 15 | Actually Not Jack | 465 SS | SF-Jack | LF-Stream | SF-Speed |

## 乱 Regular Speed（regular dans/speed）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reg-0 Map-3 Yi Meng Qian X | 172 | 3.05 | 0 | Actually Not Jack | 86 Mid JS, Jacky, Technical | SF-Jack | BF-Stream | MP-Speed-T |
| Reg-1 Map-3 Break  XingRen | 96 | 2.86 | 1 | Actually Not Jack | 192 Broken SS | SF-Jack | BF-Stream | SF-Speed |
| Reg-2 Map-3 Love Emotion   | 143 | 3.64 | 2 | 71 Speedjack | 143 Mid HS, Jacky | SF-Jack | LR-Stream | O-Speed-T |
| Reg-3 The Last Page  Oekak | 195 | 4.08 | 3 | Actually Not Jack | 195 Broken JS | SF-Jack | SP-Stream | LR-Speed |
| Reg-4 Icyxis  tyrcs | 222 | 4.25 | 4 | Actually Not Jack | 222 SS | SF-Jack | SF-Stream | LP-Speed-T |
| Reg-5 Reimei Sketchbook  B | 238 | 4.83 | 5 | Actually Not Jack | 238 SS | SF-Jack | MR-Stream | LP-Speed-T |
| Reg-6 DIE IN THE SEA  Xing | 110 | 5.05 | 6 | Actually Not Jack | 220 Broken JS, Technical | SF-Jack | MR-Stream | LP-Speed-T |
| Various Artists - Malody 4 | 186 | 5.15 | 7 | Actually Not Jack | 278 SS, Technical | SF-Jack | BR-Stream | MR-Speed |
| Reg-8 Snow Veil -Shoujo to | 160 | 5.74 | 8 | Actually Not Jack | 320 SS, Technical | SF-Jack | HR-Stream | LF-Speed-W |
| Reg-9 Stray Star  Sorakaru | 145 | 5.79 | 9 | Actually Not Jack | 290 SS | SF-Jack | MR-Stream | LF-Speed-W |
| Reg-10 Yue Ai Yue Ye  Yuza | 150 | 5.88 | 10 | 75 Speedjack | 300 SS | SF-Jack | HR-Stream | LF-Speed-W |
| Extra-1 Eiya no Parade (1. | 169 | 6.38 | 11 | Actually Not Jack | 339 SS | SF-Jack | MF-Stream | MF-Speed-W |
| Extra-2 Torikago  Hylotl v | 159 | 6.38 | 12 | Actually Not Jack | 317 SS | SF-Jack | MR-Stream | LF-Speed-W |
| Extra-3 Euthanasia (1.05x) | 160 | 6.62 | 13 | Actually Not Jack | 319 SS | SF-Jack | MF-Stream | LF-Speed-W |
| Extra-4 Pure Ruby  Hylotl | 178 | 7.11 | 14 | Actually Not Jack | 354 SS | SF-Jack | SF-Stream | MF-Speed |
| Extra-5 Electric Angel (1. | 180 | 7.57 | 15 | Actually Not Jack | 360 SS | SF-Jack | MR-Stream | LF-Speed-W |
| Extra-6 Pastel Subliminal  | 187 | 7.82 | 16 | Actually Not Jack | 374 SS | SF-Jack | LF-Stream | LF-Speed-W |
| Extra-7 Stay Alive (Zekk R | 106 | 8.68 | 17 | Actually Not Jack | 425 SS | SF-Jack | SF-Stream | LF-Speed |
| Extra-8 Amatsukami (1.15x) | 207 | 8.69 | 18 | Actually Not Jack | 414 SS | SF-Jack | MR-Stream | LF-Speed-W |
| Extra-9 Shuuten  Hinaka_Yu | 222 | 9.08 | 19 | 111 Speedjack | 444 SS | SF-Jack | LR-Stream | LF-Speed-W |
| Extra-Final Kizuato (1.3x) | 225 | 9.72 | 20 | Actually Not Jack | 450 SS | SF-Jack | SR-Stream | LR-Speed |

## 技 Reform Tech（reform dans/tech）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Want U 2 ~ 1st ~ (Marathon | 142 | 3.03 | 1 | Actually Not Jack | 71 Full HS | SF-Jack | LF-Stream | O-Speed-W |
| Vermillion ~ 2nd ~ (Marath | 143 | 3.22 | 2 | Actually Not Jack | 143 Broken JS, Jacky | SF-Jack | SR-Stream | O-Speed-T |
| Kirlian Shores ~ 3rd ~ (Ma | 105 | 2.89 | 3 | Actually Not Jack | 105 Broken JS, Technical | SR-Jack | MR-Stream | O-Speed-W |
| Ephemera ~ 4th ~ (Marathon | 180 | 4.45 | 4 | Actually Not Jack | 180 Mid JS | SF-Jack | MF-Stream | O-Speed-T |
| Brainfog ~ 5th ~ (Marathon | 151 | 4.63 | 5 | Actually Not Jack | 151 Full JS | SF-Jack | MF-Stream | O-Speed-W |
| The Bird's Midair Heatstro | 125 | 4.47 | 6 | 125 Speedjack | 188 Mid JS, Technical | SF-Jack | SR-Stream | O-Speed-W |
| WAVE ~ 7th ~ (Marathon) | 130 | 5.53 | 7 | 130 Speedjack | 130 Full HS | SF-Jack | MF-Stream | O-Speed-W |
| RATO ~ 8th ~ (Marathon) | 120 | 5.80 | 8 | Actually Not Jack | 240 Mid JS | SF-Jack | SR-Stream | LR-Speed |
| Cicadidae ~ 9th ~ (Maratho | 120 | 6.23 | 9 | Actually Not Jack | 240 Mid JS, Technical | SF-Jack | SR-Stream | LP-Speed-T |
| Rave 7 1.1x ~ 10th ~ (Mara | 220 | 6.58 | 10 | Actually Not Jack | 329 SS, Jacky, Technical | SF-Jack | HF-Stream | SP-Speed-T |
| Odoru Mizushibuki ~ Alpha  | 152 | 6.54 | 11 | 152 Bullet / Minijack | 152 Full HS | SF-Jack | MR-Stream | O-Speed-W |
| Blue Planet ~ Beta ~ (Mara | 147 | 7.11 | 12 | 147 Speedjack | 294 Full JS | SF-Jack | MR-Stream | LP-Speed |
| Fastest Crash ~ Gamma ~ (M | 210 | 7.32 | 13 | Actually Not Jack | 315 Broken JS, Jacky, Technical | SF-Jack | SR-Stream | O-Speed-T |
| Crescent Moon Boss Battle  | 181 | 8.19 | 14 | Actually Not Jack | 334 SS, Technical | SF-Jack | SR-Stream | O-Speed-T |
| Forgotten ~ Epsilon ~ (Mar | 350 | 9.13 | 15 | 175 Mid Chordjack | 175 Full HS | SF-Jack | MR-Stream | O-Speed-W |

## 技 Regular Tech（regular dans/tech）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reg-0 Map-2 Rambling Pleat | 118 | 2.35 | 0 | Actually Not Jack | 118 Mid JS, Jacky, Technical | SF-Jack | SF-Stream | O-Speed |
| Reg-1 Map-2 Koiseyo Otome  | 220 | 3.28 | 1 | 55 Speedjack | 110 Broken JS, Jacky | SF-Jack | MR-Stream | O-Speed-T |
| Reg-2 Map-2 Seyana  boomus | 144 | 3.33 | 2 | 72 Speedjack | 144 Mid HS, Jacky | SF-Jack | MF-Stream | O-Speed |
| Reg-3 Onegai! Kon Kon Oina | 175 | 4.12 | 3 | 87 Speedjack | 88 Full HS, Jacky | SF-Jack | LR-Stream | O-Speed-W |
| Reg-4 Fire in the sky  Xin | 110 | 3.89 | 4 | 110 Speedjack | 165 Broken JS, Technical | SF-Jack | SR-Stream | MP-Speed-T |
| Reg-5 Cute na Kanojo  tyrc | 160 | 4.56 | 5 | 161 Speedjack | 160 Mid JS | SF-Jack | SR-Stream | O-Speed-W |
| Reg-6 Call Me, Beep Me (If | 120 | 5.02 | 6 | 120 Speedjack | 240 Mid JS, Jacky, Technical | SF-Jack | MF-Stream | LP-Speed-T |
| Reg-7 Six Acid Strings  Mi | 200 | 5.21 | 7 | 100 Speedjack | 200 Mid JS, Technical | SF-Jack | SP-Stream | SP-Speed-T |
| Reg-8 Yoru ni Kakeru (1.05 | 136 | 5.71 | 8 | 137 Speedjack | 273 Broken JS, Technical | SF-Jack | HR-Stream | O-Speed |
| Reg-9 Cold Planet  Hinaka_ | 174 | 5.83 | 9 | Actually Not Jack | 261 Broken JS | SF-Jack | SF-Stream | O-Speed |
| Reg-10 Rocky Buinne  tera | 277 | 6.02 | 10 | 139 Speedjack | 277 Broken JS | SF-Jack | HR-Stream | O-Speed-T |
| Extra-1 Tailin no Soul (1. | 164 | 6.17 | 11 | 164 Speedjack | 261 SS, Jacky, Technical | SF-Jack | SF-Stream | LP-Speed-T |
| Extra-2 Towards the Horizo | 154 | 6.59 | 12 | 154 Speedjack | 309 Mid JS, Technical | SF-Jack | MP-Stream | LP-Speed-T |
| Extra-3 INTERNET OVERDOSE  | 171 | 6.98 | 13 | Actually Not Jack | 171 Full HS | SF-Jack | SF-Stream | O-Speed-T |
| Extra-4 Asymmetrical Groov | 150 | 7.07 | 14 | 150 Bullet / Minijack | 300 Mid HS | SF-Jack | LF-Stream | O-Speed-T |
| Extra-5 Unsan-musho  hinak | 330 | 7.39 | 15 | Actually Not Jack | 322 SS, Jacky, Technical | SF-Jack | MR-Stream | LP-Speed-T |
| Extra-6 Extraction  Oekaki | 176 | 7.63 | 16 | 174 Speedjack | 383 SS, Jacky, Technical | SF-Jack | SR-Stream | LR-Speed |
| Extra-7 Alpha  Zetsfy | 186 | 8.41 | 17 | Actually Not Jack | 372 Mid JS, Technical | SF-Jack | SF-Stream | O-Speed |
| Extra-8 Shuu no hazama  te | 187 | 8.88 | 18 | Actually Not Jack | 374 SS | SF-Jack | SR-Stream | LP-Speed-T |
| Extra-9 Nhelv  tera | 195 | 9.10 | 19 | 195 Low Chordjack | 195 Mid HS, Technical | SF-Jack | MF-Stream | O-Speed |
| Extra-Final NEURO-CLOUD-9  | 200 | 9.86 | 20 | Actually Not Jack | 429 SS, Technical | SF-Jack | SR-Stream | LP-Speed |

## 叠 Signicial（signicial dans/jack）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stage I - Dweller's Empty  | 120 | 2.20 | 1 | 60 Speedjack | 60 Mid HS, Jacky | SF-Jack | MF-Stream | O-Speed-W |
| Stage II - Sayonara Hatsuk | 178 | 2.71 | 2 | 89 Speedjack | 89 Mid HS, Jacky | SR-Jack-W | LF-Stream | O-Speed |
| Stage III - Reincarnation | 240 | 2.78 | 3 | 120 Speedjack | 120 Broken JS, Jacky | SF-Jack | SF-Stream | O-Speed |
| Stage IV - Backyun! - BAD  | 140 | 3.76 | 4 | 70 Low Chordjack | 140 Broken HS, Jacky | SR-Jack-W | HR-Stream | O-Speed-W |
| Stage V - air's gravity | 137 | 4.17 | 5 | 137 Bullet / Minijack | 137 Mid HS, Jacky | SR-Jack-W | LF-Stream | O-Speed-T |
| Stage VI - Another Medium | 130 | 4.51 | 6 | 130 Speedjack | 130 Mid HS, Jacky | MF-Jack | SF-Stream | O-Speed-T |
| Stage VII - Saltwater Chic | 140 | 4.95 | 7 | 140 Bullet / Minijack | 140 Mid HS, Jacky | SF-Jack | HR-Stream | O-Speed-W |
| Stage VIII - EVERGREEN The | 145 | 5.19 | 8 | 145 Low Chordjack | 145 Mid HS, Jacky | SR-Jack-W | HF-Stream | O-Speed |
| Stage IX - Alea jacta est! | 162 | 5.37 | 9 | 162 Bullet / Minijack | 162 Mid HS, Jacky | SR-Jack-W | HF-Stream | O-Speed-W |
| Stage X - What is love (Cu | 124 | 5.92 | 10 | 124 High Chordjack | 124 Mid HS, Jacky | LR-Jack-W | HR-Stream | O-Speed-W |
| Stage XI - Count What You  | 134 | 6.28 | 11 | 134 Mid Chordjack | 134 Mid HS, Jacky | LR-Jack-W | HF-Stream | O-Speed-W |
| Stage XII - 1NKBURNER (Cut | 147 | 6.60 | 12 | 147 Mid Chordjack | 147 Broken HS, Jacky | LR-Jack-W | HR-Stream | O-Speed-W |
| Stage XIII - The Safari | 135 | 6.73 | 13 | 135 High Chordjack | 135 Broken HS, Jacky | HR-Jack-W | HR-Stream | O-Speed-W |
| Stage XIV - Nijiiro Kekkai | 148 | 7.87 | 14 | 148 Anchor / High Chordjack | 148 Broken HS, Jacky | LR-Jack-W | HR-Stream | O-Speed-W |
| Last Stage - GOODTEK | 190 | 8.81 | 15 | 190 High Chordjack | 190 Mid HS, Jacky | LR-Jack-W | HR-Stream | O-Speed-W |

## 技 Signicial（signicial dans/tech）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stage I - Analogy (TV Size | 136 | 2.74 | 1 | 68 Speedjack | 136 Broken JS | SR-Jack | SR-Stream | O-Speed-T |
| Stage II - IONIZATION | 185 | 2.57 | 2 | 92 Speedjack | 92 Mid SS | SF-Jack | SF-Stream | SF-Speed |
| Stage III - Ambitious | 182 | 3.40 | 3 | Actually Not Jack | 182 Broken JS, Technical | SF-Jack | SF-Stream | LR-Speed |
| Stage IV - for Q | 260 | 3.91 | 4 | Actually Not Jack | 130 Mid JS | SF-Jack | SP-Stream | O-Speed-T |
| Stage V - kibou no tsuki f | 276 | 4.06 | 5 | 138 Speedjack | 138 Mid JS, Jacky, Technical | SF-Jack | MR-Stream | O-Speed-W |
| Stage VI - BIRTH | 176 | 4.64 | 6 | Actually Not Jack | 176 Mid JS, Jacky, Technical | SF-Jack | SR-Stream | O-Speed |
| Stage VII - girls.exe | 188 | 4.92 | 7 | Actually Not Jack | 197 SS, Jacky, Technical | SF-Jack | SF-Stream | O-Speed |
| Stage VIII - Hestia | 190 | 5.19 | 8 | Actually Not Jack | 190 Broken JS, Jacky, Technical | SF-Jack | SF-Stream | O-Speed-T |
| Stage IX - Angel's Salad | 177 | 5.71 | 9 | Actually Not Jack | 177 Mid HS, Jacky, Technical | SF-Jack | MR-Stream | O-Speed-T |
| Stage X - T'Suramic | 212 | 5.85 | 10 | Actually Not Jack | 212 Mid HS, Technical | SF-Jack | MR-Stream | SP-Speed |
| Stage XI - Nowise (Cut Ver | 174 | 6.37 | 11 | Actually Not Jack | 348 Mid JS | SF-Jack | SR-Stream | O-Speed-T |
| Stage XII - Rainshower (Cu | 174 | 6.59 | 12 | 174 Speedjack | 174 Full HS | SF-Jack | MP-Stream | O-Speed-W |
| Stage XIII - Jailbreak (Cu | 174 | 7.38 | 13 | 174 Speedjack | 348 SS, Technical | SF-Jack | MF-Stream | O-Speed |
| Stage XIV - Sulfide (Cut V | 170 | 7.95 | 14 | 170 Speedjack | 340 Broken JS, Technical | SF-Jack | MR-Stream | LP-Speed-T |
| Last Stage - POLYBIUS GB S | 238 | 8.72 | 15 | Actually Not Jack | 238 Mid HS, Technical | SF-Jack | MR-Stream | O-Speed-W |

## 乱 Signicial（signicial dans/speed）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stage I - I Can Fly in The | 149 | 3.17 | 1 | Actually Not Jack | 149 Broken JS | SF-Jack | SP-Stream | O-Speed-T |
| Stage II - AXION | 160 | 3.33 | 2 | Actually Not Jack | 160 SS | SF-Jack | BF-Stream | LP-Speed |
| Stage III - Phi | 190 | 3.83 | 3 | Actually Not Jack | 190 Broken SS | SF-Jack | SF-Stream | MR-Speed |
| Stage IV - 498 Tokio (Cut  | 195 | 4.10 | 4 | Actually Not Jack | 195 SS | SR-Jack | BR-Stream | MR-Speed |
| Stage V - BREAK IT (Cut Ve | 138 | 4.49 | 5 | Actually Not Jack | 207 SS | SF-Jack | MF-Stream | LF-Speed-W |
| Stage VI - The Wanderlast  | 230 | 4.65 | 6 | Actually Not Jack | 230 SS, Technical | SF-Jack | MR-Stream | MP-Speed |
| Stage VII - Serendipity (T | 173 | 4.97 | 7 | Actually Not Jack | 259 SS | SF-Jack | MR-Stream | MF-Speed-W |
| Stage VIII - Eureka | 150 | 5.32 | 8 | Actually Not Jack | 300 SS, Technical | SF-Jack | SF-Stream | MF-Speed-W |
| Stage IX - Angel Halo | 203 | 5.88 | 9 | Actually Not Jack | 305 SS | SF-Jack | MR-Stream | LF-Speed-W |
| Stage X - cold planet (Cut | 174 | 6.01 | 10 | Actually Not Jack | 261 SS | SF-Jack | SR-Stream | LF-Speed-W |
| Stage XI - NightTheater | 151 | 6.20 | 11 | Actually Not Jack | 302 SS | SF-Jack | MR-Stream | LF-Speed-W |
| Stage XII - DON'T GIVE A F | 175 | 6.62 | 12 | Actually Not Jack | 350 SS | SF-Jack | MR-Stream | O-Speed-W |
| Stage XIII - Nirmiti (Cut  | 182 | 7.55 | 13 | 91 Speedjack | 364 SS | SF-Jack | SF-Stream | MF-Speed-W |
| Stage XIV - Tojita Sekai ( | 205 | 8.21 | 14 | Actually Not Jack | 410 SS | MF-Jack | HF-Stream | LF-Speed-W |
| Last Stage - Disconnected  | 155 | 9.09 | 15 | Actually Not Jack | 466 SS | SF-Jack | SP-Stream | MF-Speed-W |

## 切 Signicial（signicial dans/stamina）

| 谱面 | BPM | osu星 | 段位 | 主叠键型 | 主切键型 | 大勿叠名称 | 切名称 | 乱名称 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stage I - Dummy! - Remix ( | 140 | 2.95 | 1 | Actually Not Jack | 140 Broken JS | SF-Jack | SF-Stream | O-Speed-W |
| Stage II - Sky is the Limi | 148 | 3.24 | 2 | Actually Not Jack | 148 Mid HS | SF-Jack | MF-Stream | O-Speed-T |
| Stage III - Kouyou (Cut Ve | 170 | 3.81 | 3 | Actually Not Jack | 170 Broken JS | SF-Jack | SF-Stream | O-Speed-T |
| Stage IV - Reon - Remind ( | 182 | 4.49 | 4 | 91 Speedjack | 182 Full HS | SF-Jack | HF-Stream | O-Speed-T |
| Stage V - Ouka Sange (Cut  | 168 | 4.75 | 5 | Actually Not Jack | 168 Full HS | SF-Jack | MR-Stream | O-Speed |
| Stage VI - Shinwa ni mebuk | 197 | 4.97 | 6 | Actually Not Jack | 197 Mid HS | SF-Jack | MR-Stream | O-Speed-W |
| Stage VII - Synthesis. (Cu | 180 | 5.44 | 7 | Actually Not Jack | 180 Mid HS, Technical | SF-Jack | MF-Stream | O-Speed-T |
| Stage VIII - Literal Cryst | 200 | 5.65 | 8 | Actually Not Jack | 200 Dense JS | SF-Jack | MR-Stream | O-Speed-W |
| Stage IX - CERCAESOTERICA | 205 | 5.89 | 9 | 102 Speedjack | 205 Full HS | SF-Jack | LF-Stream | O-Speed-W |
| Stage X - Kisaragi (Cut Ve | 230 | 6.21 | 10 | Actually Not Jack | 230 Mid JS | SF-Jack | HR-Stream | O-Speed-T |
| Stage XI - Sendan Life (ka | 260 | 6.47 | 11 | Actually Not Jack | 260 Broken JS | SF-Jack | SR-Stream | O-Speed-T |
| Stage XII - The Limit Does | 260 | 6.85 | 12 | Actually Not Jack | 260 Dense JS | SF-Jack | MR-Stream | O-Speed-T |
| Camellia - Dan Signicial's | 266 | 7.34 | 13 | 133 Speedjack | 266 Full HS, Technical | SF-Jack | LR-Stream | O-Speed-T |
| Stage XIV - Excuse Me, But | 273 | 7.99 | 14 | Actually Not Jack | 273 Full HS | SF-Jack | LR-Stream | O-Speed-T |
| Last Stage - Juggernaut 1. | 300 | 8.82 | 15 | 150 Anchor / Mid Chordjack | 300 Full HS | LR-Jack-W | HF-Stream | O-Speed-W |
