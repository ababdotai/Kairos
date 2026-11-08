# Kairos 生成式分享网页：接入与部署

当前代码已包含：选笔记 → AI 编排 → 编辑与预览 → 下载 HTML → 邮箱登录 → 发布独立链接 → 管理和撤回。**仓库代码完成不代表线上服务已开通**：需要你创建 Supabase、配置邮件和重新部署网站。已有笔记不自动上传，第一版只分享文字。

## 需要的资源

| 资源 | 用途 | 如何准备 |
| --- | --- | --- |
| 现有 Vercel 网站项目 | 托管 `/kairos/s/?id=…` 分享查看器 | 沿用现有项目，不需要新域名 |
| 一个 Supabase 项目 | Postgres 分享数据、邮箱登录 | 免费计划可用于初期验证；按实际用量升级 |
| 邮件 SMTP 服务 + 发件域名 | 给外部用户发登录验证码 | 在 Supabase 配置 SMTP，在域名 DNS 添加服务商要求的验证记录 |
| 用户已有 AI API Key | 生成内容与选择版式 | 复用 Kairos 设置，不需自建模型服务 |

本版无需对象存储或图片 CDN。每页最多 500 KB 数据，每个账号最多 50 个在线分享。免费 Supabase 数据库/邮件限制与付费价格以 [官方价格页](https://supabase.com/pricing) 为准。费用来自数据库/流量、验证码邮件和用户自己的 AI 请求。

## 1. 创建 Supabase

1. 登录 Supabase，创建组织与项目，选择目标用户访问较好的区域，妥善保存数据库密码。
2. 在 SQL Editor 执行整个 `supabase/migrations/202611080001_share_pages.sql`，仅需运行一次。
3. 在项目 Connect / API 设置中获取项目 URL（`https://项目标识.supabase.co`）和 **publishable key** 或旧版 **anon key**。
4. 不要将 `service_role`、secret key 或数据库密码填入网站环境变量。网站构建会拒绝这类 key。公开 key 本来就允许出现在前端，数据访问由数据库权限与作者身份限制。

迁移不允许客户端直接读取整张表；匿名用户只能凭 UUID 查询单页，不能遍历或写入。发布、列出本人分享和撤回均通过校验 `auth.uid()` 的函数完成。随机链接不是私密访问控制：得到链接的人都能看。

## 2. 启用邮箱验证码登录

1. 在 Authentication 中启用 Email 登录及注册。
2. 将 **Magic Link** 和 **Confirm signup** 邮件模板都设置为展示验证码，例如：

   ```html
   <h2>Sign in to Kairos</h2>
   <p>Your sign-in code: <strong>{{ .Token }}</strong></p>
   <p>If you did not request this, ignore this email.</p>
   ```

3. 在 Authentication 邮件/SMTP 设置里填入邮件服务商的 host、port、username、password 和验证过的发件地址；按邮件服务商要求配置域名 DNS。
4. 用团队邮箱测试后，再用组织外邮箱验证收件和登录。配置合理的邮件发送频率限制。

Supabase 默认邮件服务只适合组织成员测试，不能直接用于外部用户；正式开放必须配置 SMTP。参见 [SMTP 官方说明](https://supabase.com/docs/guides/auth/auth-smtp) 和 [Email OTP 说明](https://supabase.com/docs/guides/auth/auth-email-passwordless)。

本版登录只保存短期 access token 到 `chrome.storage.session`，不保存 refresh token；浏览器重启或会话过期后重新输入验证码。

## 3. 部署网站

在 **Kairos 网站的 Vercel 项目**添加以下变量，并重新部署：

```text
SUPABASE_URL=https://项目标识.supabase.co
SUPABASE_ANON_KEY=公开的 publishable 或 anon key
```

网站 build 会把公开配置生成到 `/kairos/share-config.json`，把共享渲染器复制到网站产物。不提供任何 secret。主站对 `/kairos/*` 的现有转发必须覆盖 `/kairos/share-config.json` 与 `/kairos/s/*`，并保留 CORS 响应头。

部署后打开 `https://www.abab.ai/kairos/share-config.json`，确认返回项目 URL 与公开 key，而不是主站 HTML；响应头应有 `Access-Control-Allow-Origin: *`，扩展才能跨域读取。公开页面直接通过 Supabase HTTPS API 读取内容。

## 4. 构建扩展与验收

```sh
npm run build
npm --prefix website run build
node test/share-page.mjs
node test/share-service.mjs
node test/dashboard-browser.mjs
sh test/share-database.sh
```

最后一个检查需要本机 PostgreSQL 工具，启动隔离的临时数据库并自动清理，不连接正式数据库。它模拟 Supabase 的 auth.uid()，不能替代线上 Auth、网关和邮件测试。

重新加载 `dist` 扩展，在笔记管理页点击「生成分享网页」：

1. 只选两条笔记，生成并检查引用，确认没有未选择的笔记；修改正文、切换主题，下载 HTML。
2. 关闭后重开，确认草稿恢复。生成使用真实 AI 账号，需要有效 API Key 和额度。
3. 在「发布链接」中邮箱登录，发布后用无痕窗口打开链接，确认无需登录也能读。
4. 换另一个账号确认看不到前一个账号的管理列表、无法撤回其页面。
5. 作者撤回后，用全新无痕页面重新打开原链接，应显示不存在或已撤回。已经打开的页面和下载副本不会被远程擦除。
6. 测试手机宽度、网络失败、验证码过期和服务未配置。再次发布会创建新的独立链接，旧链接不会随草稿修改。

上线前必须完成第 3–5 项真实服务验证；本地测试不能证明线上配置有效。现有扩展没有新增 host 权限，依赖网站配置的 CORS 和 Supabase 自带 CORS。

## 本版边界

- AI 在可信组件中组合叙述、卡片、时间线和引语；不会运行模型生成的 JavaScript，也不是任意 HTML 执行器。
- 源笔记保留时间标记；若存在手动原文和 AI 整理版，两者一起保留。字幕只供模型理解，不直接发布；生成结果仍需作者检查。
- 不上传截图、不自动联网补充事实、不提供密码保护、协作编辑或账号自动删除入口。账号删除可联系隐私页邮箱，由管理员删除 Auth 用户（关联页面级联删除）。
- 对外公开前，根据规模配置反滥用限制与内容投诉处理；当前有每页/每账号容量限制，但不构成完整的反注册滥用系统。
- 分享页 `noindex`，暂未实现社交平台动态预览图或独立 OG 元数据；这是后续提升传播效果的迭代项。
