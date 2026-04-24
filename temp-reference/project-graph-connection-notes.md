# project-graph 连接逻辑检查

时间: 2026-04-24

说明:
- 终端环境当前无法直接 `git clone https://github.com/graphif/project-graph.git`。
- 下面的结论来自公开仓库页面、代码索引结果和文件结构检查，不是完整本地克隆后的逐行审计。
- 参考仓库: https://github.com/graphif/project-graph

已定位到的关键文件:
- `app/src/core/stage/stageManager/concreteMethods/StageNodeConnector.tsx`
- `app/src/core/stage/stageManager/concreteMethods/StageManagerUtils.tsx`
- `app/src/core/stage/stageObject/association/Edge.tsx`
- `app/src/core/stage/stageObject/association/LineEdge.tsx`
- `app/src/core/stage/stageObject/association/CubicCatmullRomSplineEdge.tsx`
- `app/src/core/stage/stageObject/entity/ConnectPoint.tsx`
- `app/src/core/render/canvas2d/entityRenderer/edge/EdgeRenderer.tsx`
- `app/src/core/render/canvas2d/entityRenderer/edge/concrete/StraightEdgeRenderer.tsx`
- `app/src/core/render/canvas2d/entityRenderer/edge/concrete/SymmetryCurveEdgeRenderer.tsx`
- `app/src/core/render/canvas2d/entityRenderer/edge/concrete/VerticalPolyEdgeRenderer.tsx`
- `app/src/core/stage/stageObject/association/EdgeCollisionBoxGetter.tsx`

结构判断:
1. `project-graph` 把“连接关系”和“如何画线”拆成了两层。
2. `StageNodeConnector.tsx` 更像连接控制器，负责建立、修改、反转边。
3. `Edge.tsx` / `LineEdge.tsx` / `CubicCatmullRomSplineEdge.tsx` 更像边模型，保存 source / target 几何信息和中间路径数据。
4. `ConnectPoint.tsx` 说明节点不是只靠整个矩形包围盒连接，而是支持显式连接点或端口。
5. `StraightEdgeRenderer.tsx`、`VerticalPolyEdgeRenderer.tsx`、`SymmetryCurveEdgeRenderer.tsx` 负责不同线条样式的渲染。

这说明它的连接逻辑大致是:
1. 先确定从哪个节点、哪个连接点连到哪个目标。
2. 再生成一条边对象，边对象持有 sourceLocation / targetLocation / bodyLine 一类几何数据。
3. 最后交给不同 renderer 决定是直线、竖向折线还是对称曲线。

和当前 quadrant 的差别:
- 旧的 `quadrant` 更像“拿两个框的中心点，现场推一条正交折线”。
- `project-graph` 更接近“先有端口/连接点，再有边模型，再有渲染器”。
- 这也是为什么它比单纯按矩形包围盒求锚点更稳定。

对 quadrant 的直接启发:
1. 锚点不能只按矩形处理，应该按真实图形边界或显式 side/port 处理。
2. 折线/曲线不应该和连接语义耦死，最好把“连哪里”和“怎么画”拆开。
3. 预览边和最终边最好复用同一套 edge 几何模型。

当前已在本地 quadrant 中落地的第一步:
- 连线起点和终点不再优先按矩形包围盒计算。
- 现在会优先按 SVG 图形真实外轮廓求射线交点，再回退到矩形/椭圆/菱形的解析锚点。
- 正交线会从明确的出边离开，并从目标图形对应的入边进入。

如果后续继续往 `project-graph` / GoJS 的方向靠，可以继续做:
1. 给每种图形定义显式 side/spot 规则。
2. 给每个节点引入可见或不可见 port。
3. 把直线、折线、曲线改成可切换 renderer。
