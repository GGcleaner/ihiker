# iRunner 智能跑步助手

iRunner 是一款智能跑步助手应用，帮助徒步爱好者记录和分析他们的徒步轨迹、速度、距离等关键数据。

## 功能特点

- 实时轨迹记录：使用百度地图 API 实时显示和记录跑步轨迹
- 关键数据监测：实时计算并显示距离、用时、配速和速度
- 轨迹管理：支持开始、暂停、继续和结束跑步记录
- 数据存储：通过 Supabase 存储用户的跑步记录
- 天气信息：显示当前位置的天气状况
- 语音播报：提供关键节点的语音提示（如距离、时间）
- 成就系统：根据跑步数据解锁相应成就

## 技术栈

- 前端框架：React
- 构建工具：Vite
- 地图服务：百度地图 API
- 后端服务：Supabase（用于数据存储和用户认证）
- 样式：自定义 CSS

## 项目结构

```Plain
ihiker-main/
├── src/
│   ├── types/          # TypeScript 类型定义
│   ├── services/       # 服务类（Supabase、天气、语音等）
│   ├── stores/         # 状态管理
│   └── main.ts         # 主应用逻辑
├── index.html          # 主页面
├── style.css           # 样式文件
├── script.js           # 辅助脚本
├── package.json        # 项目依赖配置
└── package-lock.json   # 依赖版本锁定
```

## 安装与运行

1. 克隆仓库到本地

```Bash
git clone <仓库地址>
cd ihiker-main
```

1. 安装依赖

```Bash
npm install
```

1. 启动开发服务器

```Bash
npm run dev
```

1. 在浏览器中访问 `http://localhost:5173`（默认端口，具体以终端输出为准）

## 构建生产版本

```Bash
npm run build
```

构建后的文件将生成在 `dist` 目录下，可以部署到任何静态文件服务器。

## 环境配置

需要配置 Supabase 相关环境变量，在项目根目录创建 `.env` 文件：

```Plain
VITE_SUPABASE_URL=你的Supabase URL
VITE_SUPABASE_SUPABASE_ANON_KEY=你的Supabase匿名密钥
```

## 使用说明

1. 打开应用后，系统会请求位置权限，请允许以获取准确的定位服务
2. 点击"开始"按钮开始记录跑步轨迹
3. 跑步过程中可以随时暂停或继续记录
4. 结束跑步时，点击"结束"按钮，系统会保存你的跑步记录
5. 可以在"历史"中查看过往的跑步记录
6. "统计"页面提供你的跑步数据汇总分析

## 注意事项

- 应用需要现代浏览器支持（推荐 Chrome、Firefox、Edge 等最新版本）
- 确保设备开启定位服务并授予应用定位权限
- 长时间使用可能会消耗较多电量，建议在跑步时保持设备充电

## 许可证

[MIT](LICENSE)
