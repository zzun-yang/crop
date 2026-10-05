# 巴尔喀什湖区域网页图层数据说明

整理日期：2026-10-04。保存位置：`C:\Dataspace\10.4`。

## 范围与时间

采用东经 72°—85°、北纬 42°—49° 的展示矩形，覆盖巴尔喀什湖及伊犁河上游，并包含周边地理要素。底图与行政边界仅用该矩形筛选相交要素，保留原始完整几何，实际数据范围可以大幅超出矩形。**此矩形不是水文学意义上的精确流域边界**，文件也没有按精确流域掩膜裁剪。坐标系均为 WGS84（EPSG:4326）；GeoJSON 坐标顺序为经度、纬度。

影像服务按 2024、2025、2026 年各年 6—9 月组织。气象数据为对应年份的逐月实际历史再分析数据，2024/2025 各 12 个月，2026 为 1—8 月；没有用多年平均气候代替这三年的气象数据。河湖、地形与行政边界是静态背景数据，不代表逐年变化。

## 文件介绍

|目录/文件|内容及用途|
|---|---|
|`01_basemap/rivers.geojson`|Natural Earth 概览河流，5 个要素，含伊犁河及巩乃斯河等名称；适合区域概览标注，不能代表完整河网。|
|`01_basemap/lakes.geojson`|Natural Earth 湖泊面，共 10 个要素，包含巴尔喀什湖；适合填色与名称标注。|
|`01_basemap/mountain_ranges.geojson`|6 个完整主要山系/高地区域，包括天山、阿拉套、博罗科努、塔尔巴哈台等。它们是地图标注范围，包含一个高原要素，不是严格的山体地貌边界。|
|`02_boundaries/countries.geojson`|与筛选范围相交的完整国家面，3 个国家：中国、哈萨克斯坦、吉尔吉斯斯坦。|
|`02_boundaries/country_borders.geojson`|完整国家陆地边界线，3 个要素。|
|`02_boundaries/provinces.geojson`|完整州/省级行政区面，12 个要素。|
|`02_boundaries/province_borders.geojson`|完整州/省级行政区边界线，13 个要素。|
|`03_terrain/elevation_m.tif`|高程，单位米。由 Mapzen Terrain Tiles z8 解码、拼接并重投影得到，输出网格 0.005°（约 360—557 米）；适合区域地形展示。|
|`03_terrain/slope_deg.tif`|由上述 DEM 求梯度得到的坡度，单位度；计算经纬方向距离时转换为米并按纬度修正。粗网格会平滑陡坡，不能作为精细工程坡度数据。|
|`03_terrain/*.png`|高程、坡度的着色展示图片，与同名 GeoTIFF 网格一致。高程色标 0—5000 米，坡度色标 0—45°，超出色标范围的数值仍保留在 TIFF 中。|
|`04_imagery/services.json`|S1/S2 × 2024/2025/2026，共 6 个在线影像图层的 TileJSON 与 XYZ URL、查询条件、渲染参数和测试结果。**没有下载影像数据文件。**|
|`04_imagery/S1_YYYY_tilejson.json`|各年 Sentinel-1 RTC 在线瓦片配置：VV 极化、线性 gamma0、灰度显示范围 0—0.3。|
|`04_imagery/S2_YYYY_tilejson.json`|各年 Sentinel-2 L2A 在线瓦片配置：B04/B03/B02 真彩色，拉伸 0—3000，筛选整景云量小于 20%。|
|`04_imagery/S1_YYYY_search.json`、`S2_YYYY_search.json`|可复现在线拼接服务的 STAC 查询条件。|
|`04_imagery/frontend_examples.js`|Leaflet 与 MapLibre GL JS 接入示例。|
|`05_weather/YYYY/temperature_YYYYMM.tif`|NASA POWER/MERRA-2 近地面 2 米气温月平均值，单位 °C。|
|`05_weather/YYYY/precipitation_YYYYMM.tif`|月降水量，单位 mm/月。由 API 的 PRECTOTCORR（mm/日）乘该月日数转换；源值保留在 sources 中。|
|`05_weather/YYYY/*.geojson`|与同名气象 TIFF 对应的网格面；属性 `month`、`value`、`units`。可直接用前端 fill 图层展示和点击查询；面已裁到展示矩形。|
|`05_weather/YYYY/*.png`|气象配色参考图。气温色标 -25—35°C，降水色标 0—200 mm/月；它们只是展示图，数值查询使用 TIFF 或 GeoJSON。|
|`sources/ne_10m_*.zip`|8 个 Natural Earth 官方原始全球 Shapefile ZIP，保留用于追溯；ZIP 内的 .shp/.shx/.dbf/.prj 应共同使用。10m 指 1:1000 万比例尺，**不表示 10 米空间分辨率**。|
|`sources/HydroRIVERS_v10_as_shp.zip`|HydroRIVERS 亚洲原始 Shapefile ZIP。|
|`sources/terrain_z8_X_Y.png`|90 张原始 Terrarium 编码高程瓦片，按 h=R×256+G+B/256−32768 解码，不能当普通彩色地形图使用。|
|`sources/POWER_*.json`|20 个分区气象 API 原始响应，保留完整参数、数据、源单位和时间信息。|
|`metadata/display_extent.geojson`|展示矩形参考面，`is_basin_boundary=false`。|
|`metadata/vector_sources.json`、`hydrorivers.json`、`terrain.json`、`weather.json`|来源地址、数量、时间、处理方式和相关参数。|
|`metadata/layers.json`|图层清单、坐标系、范围、栅格尺寸和数值范围。|
|`metadata/file_manifest.json`|所有交付文件的路径、大小与 SHA-256 校验值。|
|`metadata/validation.json`|文件读取、几何有效性及服务测试检查结果。|

## 在线影像服务与网页接入

已验证的服务由 Microsoft Planetary Computer 公共 Data API 提供。**无需把整景影像下载到前端**：读取 `services.json`，把 `xyz_url` 交给 Leaflet/其他 XYZ 图层，或把 `tilejson_url` 交给 MapLibre raster source。URL 中 `{z}/{x}/{y}` 是 XYZ 瓦片坐标；与 ArcGIS REST 常见的 `{z}/{y}/{x}` 顺序不同。

六个服务已在湖区附近 z9 进行实际 PNG 瓦片测试，并通过。当前测试请求不需要 API Key。配置使用服务端数据访问，不使用会过期的原始 Blob SAS 下载链接。它们是动态多日期拼接（首个有效像素），不是年度平均，也不是单日无缝正射底图；云量筛选按整景统计，仍可能有云、拼接接缝或覆盖缺口。S2 在本次测试的部分 z8 瓦片返回 204，因此配置建议 z9—14；S1 配置 z6—14。服务可用性、跨境网络速度与后续接口调整取决于提供方；需要重建时可向 `/api/data/v1/mosaic/register` 提交保存的 search JSON，然后重新获取 TileJSON。

GeoJSON 可由网页静态服务器直接提供。气象网格约为 0.625° 经度 × 0.5° 纬度，来源为 MERRA-2 再分析，并非地面站实测；输出没有插值成高精度网格。气象 TIFF 完整像元外边界为 71.5625°—85.3125°E、41.75°—49.25°N，略超出展示矩形，配套 GeoJSON 已裁剪。

TIFF 保留真实数值，可通过 GeoServer/TiTiler 等发布为瓦片。配套 PNG 的像素网格在 EPSG:4326 下均匀；如需在 Web Mercator 地图上精准叠加，先重投影为 EPSG:3857 并切成 XYZ 瓦片，不能默认把整张 PNG 拉到经纬度矩形就严格对齐。

行政边界采用 Natural Earth 的制图数据，可能没有反映近期州界调整，不作为 2024—2026 三个年份的行政区历史版本或官方界线证明。山系与湖泊采用概览制图尺度，大幅放大后应使用更精细的数据。

## 来源与署名

- Natural Earth（公共领域）：https://www.naturalearthdata.com/downloads/
- HydroRIVERS / HydroSHEDS（按产品页及技术文档中的 HydroSHEDS 许可使用，需保留来源引用）：https://www.hydrosheds.org/products/hydrorivers 。引用 Lehner & Grill (2013), Hydrological Processes 27(15):2171–2186。
- Mapzen Terrain Tiles：https://registry.opendata.aws/terrain-tiles/ 。使用时按 https://github.com/tilezen/joerd/blob/master/docs/attribution.md 保留底层来源署名；该区域以 SRTM 等混合高程来源构建，不是年度地形产品。
- Copernicus Sentinel / Microsoft Planetary Computer：https://planetarycomputer.microsoft.com/catalog 。接口文档：https://planetarycomputer.microsoft.com/api/data/v1/docs 。网页保留 Copernicus Sentinel 与 Microsoft Planetary Computer 署名。
- NASA POWER / MERRA-2：https://power.larc.nasa.gov/docs/services/api/temporal/monthly/ 。气象图层保留 NASA POWER/MERRA-2 来源说明。

## 检查结果

全部 GeoJSON 均可读取且非空、几何有效；全部 GeoTIFF 均可读取，坐标系、有效数值、网格范围已检查；全部 PNG 和原始 ZIP 均验证可读取。共有 64 个逐月气象数值栅格、64 个对应气象 GeoJSON、64 张气象展示图片；地形另有 2 个数值栅格及 2 张展示图片。六个影像服务均返回有效瓦片，测试细节见服务配置与 validation.json。

## 新增 Shapefile 格式（2026-10-04）

`01_basemap` 和 `02_boundaries` 下现有的 7 个 GeoJSON 均配有同名 Shapefile，GeoJSON 与 Shapefile 的几何和属性已核对一致。每个图层包括 `.shp`（几何）、`.shx`（索引）、`.dbf`（属性）、`.prj`（WGS84 坐标系）和 `.cpg`（UTF-8 编码）。使用或复制时请将这五个同名文件放在一起。

Shapefile 属性字段名最多为 10 个字符，较长字段名已缩短，重名时追加数字区分。每层的 `.fields.json` 记录完整的原字段名与 Shapefile 字段名映射。文本属性未截断，数值属性和要素数量已核对；几何与原 GeoJSON 一致。详细检查结果见 `metadata/shapefile_conversion.json`。


## 完整要素筛选调整（2026-10-04）

已从 `01_basemap` 删除 `rivers_hydrorivers` 详细河网、`mountain_peaks` 山峰标注点的 GeoJSON、Shapefile 和所有配套文件。原始下载 ZIP 仍保留于 `sources`，作为来源档案，不是网页使用图层。

现有 7 个底图与行政边界图层从原始 Natural Earth ZIP 重新生成。选择规则是：与东经 72°—85°、北纬 42°—49°矩形相交的要素保留完整原始几何，仅剔除完全在矩形外的要素。不切断河流、湖泊、山系、行政区面或边界线；一个多部件要素的所有组成部分也完整保留。无需扩大筛选框。

国家面包含完整的中国、哈萨克斯坦、吉尔吉斯斯坦，因此图层总范围比网页研究区大得多。这是保留完整要素的结果；前端初始视野仍可使用 `metadata/display_extent.geojson` 的研究区矩形，不必自动缩放到国家图层总范围。筛选及删除记录见 `metadata/full_feature_selection.json`。
