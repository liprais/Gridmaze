# 3D 动画 / 风洞模拟

## 方案选型

### 风洞可视化方案对比

| 方案 | 物理精度 | 开发成本 | 适用 |
|------|---------|---------|------|
| Three.js + Shader | 视觉等效 | 低 | 交互式演示、Web 展示 |
| OpenFOAM + ParaView | 工程级 | 高 | 定量仿真、论文 |
| Blender Mantaflow | 中等 | 中 | 渲染输出、视频 |

### 其他 3D 动画方案

| 方案 | 适合场景 |
|------|---------|
| Three.js | Web 3D 通用 |
| React Three Fiber | React 项目 3D |
| Manim | 数学/算法动画 |
| Unity | 实时交互、游戏级 |
| Unreal Engine | 影视级实时渲染 |

---

## Three.js 风洞方案（推荐）

### 技术栈

```
Three.js + Custom Shaders (GLSL)
├── BufferGeometry + Points (粒子系统)
├── 半透明管道几何体 (风洞体)
├── GLTFLoader (被测模型加载)
└── OrbitControls + lil-gui (调试)
```

### 流场逐步升级路线

| Level | 做法 | 效果 |
|-------|------|------|
| 1. 艺术流线 | 贝塞尔曲线绕开模型 | 简单但假 |
| 2. 势流近似 | 圆柱绕流解析解 → shader 速度场 | 有物理感 |
| 3. GPU 流体 | Fragment shader 简化 NS 方程 | 实时、有涡街 |
| 4. CFD 驱动 | OpenFOAM 算好数据 → 纹理回放 | 结果真实 |

建议从 Level 2 开始。

---

## OpenFOAM 实操

### 安装

```bash
# macOS Homebrew
brew install openfoam
source /opt/homebrew/Cellar/openfoam/*/etc/bashrc

# Docker 替代
docker pull openfoam/openfoam11-default
```

### Case 目录结构

```
caseName/
├── system/
│   ├── controlDict        # 时间步、结束时间、写入频率
│   ├── fvSchemes          # 数值格式
│   └── fvSolution         # 求解算法、收敛控制
├── constant/
│   ├── polyMesh/          # 网格
│   ├── transportProperties
│   └── turbulenceProperties
└── 0/
    ├── U                  # 速度场边界条件
    ├── p                  # 压力场边界条件
    └── k / omega          # 湍流量
```

### 风洞常用求解器

| 求解器 | 场景 |
|--------|------|
| simpleFoam | 定常不可压流 |
| pisoFoam / pimpleFoam | 瞬态不可压流 |
| rhoSimpleFoam | 可压缩/高速流 |

### 典型工作流

```bash
blockMesh                    # 1. 生成网格
checkMesh                    # 2. 检查网格质量
simpleFoam                   # 3. 跑求解器
touch case.foam && paraFoam  # 4. ParaView 可视化
```

### ParaView 可视化

- `Stream Tracer` — 粒子追踪流线
- `Glyph` — 箭头显示速度方向
- `Contour` — 压力等值线
- `Q-criterion` 等值面 — 提取涡结构
- `Calculator` → `curl(U)` — 计算涡量

### 网格工具

| 工具 | 适用 | 难度 |
|------|------|------|
| blockMesh | 简单几何体 | ⭐ |
| snappyHexMesh | STL 导入 | ⭐⭐⭐⭐ |
| cfMesh / gmsh | 替代工具 | ⭐⭐⭐ |

网格是最大的坑——网格质量决定结果好坏。

### 学习路线

1. 跑通 `pitzDaily` 教程 case
2. 用 `blockMesh` 自己画简化风洞管道
3. 加圆柱看绕流
4. 上并行、更复杂湍流模型、瞬态计算

### 读取 OpenFOAM 结果在 Web 展示

```bash
# OpenFOAM 输出可以用 foamToVTK 转成 VTK 格式
foamToVTK -case <caseDir>
# 然后用 Python 或 C++ 读取 VTK，导出为纹理/点云供 Three.js 使用
```
