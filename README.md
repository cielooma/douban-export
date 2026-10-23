# douban-export

把豆瓣的**图书 / 影视 / 音乐 / 游戏**收藏导出成 CSV、Markdown、JSON，支持只导某一类、只导「想看 / 已看」这类集合。零依赖，Node 22+。

Export a Douban user's book, film, music, and game collections to CSV, Markdown, or JSON — no dependencies, Node 22+.

## 安装

```sh
git clone <你的仓库地址> douban-export
cd douban-export
npm test          # 无依赖，不需要 npm install

npm link          # 可选：之后可以直接运行 douban-export
```

不装也行，用 `node src/cli.mjs` 等价。

## 快速开始

```sh
douban-export --user 1222949 --format csv,md
```

跑完在 `./douban-books/` 下得到 `douban-books-<user>.{csv,md}`。

## 常用命令

```sh
# 只导影视，只要「想看」
douban-export --user 224177888 --category movie --status wish

# 四类全导，「看过 / 听过 / 玩过 / 读过」都要
douban-export --user 224177888 --category all --status done --format csv,md

# 图书 + 游戏，只要想读 / 想玩，带 JSON
douban-export --user 224177888 --category book,game --status wish --format csv,md,json

# 私密收藏：先从浏览器复制 Cookie
DOUBAN_COOKIE='bid=…; dbcl2=…' douban-export --user 224177888 --category movie

# 只抓一页，把 HTML 存下来排查解析
douban-export --user 224177888 --category game --max-pages 1 --save-html ./debug
```

## 类别与状态

| 类别 | `--category` | 已完成 | 进行中 | 想 |
| --- | --- | --- | --- | --- |
| 图书 | `book` | `done` 读过 | `doing` 在读 | `wish` 想读 |
| 影视 | `movie` | `done` 看过 | `doing` 在看 | `wish` 想看 |
| 音乐 | `music` | `done` 听过 | `doing` 在听 | `wish` 想听 |
| 游戏 | `game` | `done` 玩过 | `doing` 在玩 | `wish` 想玩 |

`--status` 可写多个，默认 `done,doing,wish`。旧写法 `read` / `collect` 等于 `done`，`do` 等于 `doing`，仍然可用。

## 输出

每类一个文件：`douban-books-<user>.csv`、`douban-movies-<user>.csv`、`douban-music-<user>.csv`、`douban-games-<user>.csv`。同名文件每次运行会覆盖。

| 列 | 说明 |
| --- | --- |
| 状态 | 读过 / 看过 / 听过 / 玩过（按类别取词） |
| 标题 / 副标题 | 影视的副标题是原名，图书的副标题是副书名 |
| 详细信息 | 图书：出版信息；影视：上映日期、演员、导演、片长；音乐：表演者、发行日期、介质；游戏：平台、类型、发售日 |
| 我的评分 | 1–5 星，未评为空 |
| 标记日期 | `YYYY-MM-DD` |
| 短评 | 用户短评，没有则为空 |
| 豆瓣链接 | 条目规范链接 |

CSV 带 UTF-8 BOM，Excel 直接打开不乱码。

## 工作原理

1. 列表页按类别不同：图书 `book.douban.com/people/<id>/<collect|do|wish>`，影视 `movie.douban.com/…`，音乐 `music.douban.com/…`，游戏 `www.douban.com/people/<id>/games?action=<collect|do|wish>`。
2. 请求必须带浏览器 User-Agent 和相应站点的 Referer，否则 nginx 直接 403。
3. 每类页面的 HTML 结构不同，解析器有 `grid`（图书）、`media`（影视/音乐）、`game`（游戏）三套，全部在 `src/parse.mjs`；类别差异（域名、路径、用词）集中在 `src/categories.mjs`。
4. 只有两种情况会停：抓够页面标题声明的总数（如 `看过的影视(218)`），或连续两页都是空的。**短页不算结束**——豆瓣每个列表页有 15 个槽位，某条不公开时只渲染 14 条，把短页当成最后一页会静默少抓。
5. `start` 以 15 个槽位为单位，豆瓣会把它向下取整到所在页（`start=14` 取到的还是第一页），所以步进固定为 15；被隐藏的槽位用任何偏移都取不到，声明总数里却算着它。
6. 每页间隔默认 2.5 秒；图书/影视/音乐的 URL 固定带 `sort=time`，避免两次请求之间排序变化导致页边界重复。
7. 公开收藏不需要 Cookie；私密收藏要带 `--cookie`。

## 常见问题

- **HTTP 403 / 418**：触发了风控。等几分钟、加大 `--delay`；仍然失败就带 Cookie 再试。
- **导出 0 条**：先确认 `--user` 对不对，再看是不是私密收藏，最后确认 `--category` 和 `--status` 选的是有数据的那个（例如 `--status wish --category book` 可能本来就是空的）。
- **抓不满声明的总数**（例如 `364/390`）：影视列表每页通常只渲染 14 条，声明总数包含那些不公开的条目，用任何 `start` 都取不到，属正常。只有「重复 0 条、缺得也不规律」时才值得按提示用 `--save-html` 抓一页看真实 HTML。
- **影视/音乐短评为空**：豆瓣只在你写过短评时渲染 `span.comment`，没写就是空。

## 项目结构

```
douban-export/
├── src/
│   ├── cli.mjs        参数解析、多类别汇总、缺量提示
│   ├── categories.mjs 四类的域名、路径、用词、URL 生成
│   ├── collect.mjs    翻页、去重、覆盖度统计
│   ├── fetch.mjs      带 UA/Referer/Cookie 的请求、超时、重试、限速
│   ├── parse.mjs      三套页面结构 → 统一记录
│   ├── export.mjs     CSV / Markdown / JSON 序列化
│   └── types.mjs      记录字段的 JSDoc 定义
├── test/
│   ├── fixtures/      图书/影视/音乐/游戏四份页面快照（截取自公开收藏页）
│   └── *.test.mjs     node:test，`npm test` 运行
└── .github/workflows/ CI：Node 22 与 24 上跑测试
```

## 数据与合规

只读取公开可见的收藏页，不登录、不写操作；默认每页间隔 2.5 秒，请勿自行调低到很小的高频抓取。私密收藏需要你自己提供 Cookie，Cookie 只在本地内存里用于本次请求，不会写盘。导出的文件默认落在 `./douban-books/`，已在 `.gitignore` 里忽略。

## 下一步

- **增量导出**：把上次的 JSON 按 `subjectId` 建集合，只输出新增条目。
- **定时跑**：`cron` 或 `launchd` 每天跑一次，配合 `--format json` 落盘。
- **接入 Obsidian**：`--format md` 的输出直接放进 vault，按 `## 看过` 分节。

## 许可

[MIT](LICENSE)
