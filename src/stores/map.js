import {defineStore, storeToRefs} from "pinia";
import axios from "axios";
import {Layer, Tile} from "ol/layer";
import {OSM, TileWMS, WMTS, XYZ} from "ol/source";
// 注意：这里必须改名。ol 的 Map 会盖掉原生的 Map，
// 后果是 new Map() 拿到的是地图对象，拿它当字典用就会报 "xxx.values is not a function"
import {Map as OlMap, View} from "ol";
import {unByKey} from "ol/Observable";
// 新增

import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';

import { Style, Stroke, Fill, Text, Circle } from 'ol/style';

import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';

import OSMXML from 'ol/format/OSMXML';
import EsriJSON from 'ol/format/EsriJSON';

import { transformExtent } from 'ol/proj';

import { apply } from 'ol-mapbox-style';
import { markRaw } from 'vue';
import VectorTileLayer from 'ol/layer/VectorTile';

import PointerInteraction from 'ol/interaction/Pointer';

import TileLayer from 'ol/layer/Tile';



// 巴尔喀什湖流域的经纬度边界框
const BALKHASH_EXTENT = [72.828369, 43.325178, 81.738281, 47.620975];

// 农田地块边界叠加的参数。
// 地块数据存在 PostGIS 里，整个流域约 34 万个面，全量加载不现实，
// 因此按当前视图范围分块取数，并对范围大小和要素数量设上限。
const PARCEL_LAYER_NAME = 'agri-agent:bh_agri_parcel';
const PARCEL_MAX_SPAN = 0.2;        // 视图经纬度跨度上限（度），超过则不取数，等用户放大
const PARCEL_MAX_FEATURES = 6000;   // 单次取数的要素上限
const PARCEL_SNAP = 1e-6;           // 顶点合并精度（度），约 0.1 米
const PARCEL_REFRESH_DELAY = 400;   // 地图移动后重新取数的防抖时间（毫秒）

// 农田页日期时间轴。数据还没接入，这里先把接口留出来：
//   1) 日期列表：优先读 /static/parcelTimeline.json，读不到就用下面的占位区间生成；
//   2) 图层数据：由 parcelTimelineSource 描述（见 setParcelTimelineDates），
//      没配置时拖动时间轴只更新日期显示，不发任何请求。
const PARCEL_TIMELINE_DEFAULT_RANGE = {start: '2024-01-01', end: '2026-09-30', step: 'day'};
const PARCEL_TIMELINE_DEBOUNCE = 250;   // 拖动时间轴后延迟取数的时间（毫秒）
const PARCEL_TIMELINE_PLAY_INTERVAL = 1200; // 自动播放时每帧间隔（毫秒）

// 框选截取：拖出矩形后自动缩放居中，并把矩形以外的内容遮住，
// 之后切换日期、开关图层都只在矩形内可见。再点一次按钮取消。
const PARCEL_ROI_MASK_COLOR = 'rgba(0, 0, 0, 0.45)'; // 选区外压一层阴影：底图仍在，只是暗下来
const PARCEL_ROI_PADDING = 32; // 选区四周留白（像素）
const PARCEL_ROI_MIN_PIXELS = 8; // 框选的最小边长（像素）
const PARCEL_ROI_EDGE_TOLERANCE = 8; // 按住选中框边框拖动的判定范围（像素）

// 作物结构分析。统计范围跟着框选走，选区一变就重新取数重算。
// 目前只有一年的作物图层，多年（时间序列、种植稳定性）需要补数据：
// 调 setCropAnalysisYears({2024:'...', 2025:'...'})，或放 public/static/cropYears.json。
const CROP_ANALYSIS_DEFAULT_YEARS = {2024: 'agri-agent:bh_crop_class'};
const CROP_ANALYSIS_BASELINE_YEAR = 2024; // 稳定性分析的基准年
// 作物图层实际有 5 个编码（0-4），但图例只分 4 类：
// 编码 4 属于“其他”，这里做一次别名映射（映射到图例索引 0）
const CROP_ANALYSIS_TYPE_ALIAS = {4: 0};
const CROP_ANALYSIS_PARCEL_FIELD = 'fid_1'; // 地块标识：同一地块会有多个作物斑块
const CROP_ANALYSIS_TYPE_FIELD = 'max_gridco'; // 作物类型编码
const CROP_ANALYSIS_AREA_FIELD = 'shape_area'; // 面积字段，单位是平方度
const CROP_ANALYSIS_MAX_FEATURES = 400000; // 单年单次取数的要素上限
// 没有框选时默认统计整个流域，用的是流域图层的范围
const CROP_ANALYSIS_FULL_EXTENT = [72.4875, 42.2583, 85.0006, 49.1297];

// 农田页地区下拉框。数据还没接入，先内置几个流域内的地点作为占位，
// 接数据时用 setParcelRegions 传入，或者放 /static/parcelRegions.json。
// "全部"这个选项固定排在最后，选中后回到下面的完整视图。
const PARCEL_REGION_ALL_ID = '__all__';
const PARCEL_DEFAULT_VIEW = {center: [78.25, 45.72], zoom: 7.15}; // 要和 land-mass.vue 里的初始视图一致
const PARCEL_REGION_PADDING = 24; // 用 extent 定位时四周留白（像素）
const PARCEL_REGION_PLACEHOLDER = [
    {id: 'balkhash-lake', name: '巴尔喀什湖', center: [76.5, 46.2], zoom: 7.2},
    {id: 'kapchagay', name: '卡普恰盖水库', center: [77.07, 43.89], zoom: 9.5},
    {id: 'ili-delta', name: '伊犁河三角洲', center: [74.0, 45.4], zoom: 9},
    {id: 'taldykorgan', name: '塔尔迪库尔干', center: [78.37, 45.02], zoom: 9.5}
];

// 要素属性名的大小写在不同数据源上不一样：shapefile 里是 Max_gridco / FID_1，
// 换成 PostGIS 之后变成了 max_gridco / fid_1。这里忽略大小写读一次，两边都能用。
const readFeatureProperty = (properties, name) => {
    if(!properties || !name) return undefined
    if(properties[name] !== undefined) return properties[name]
    const lower = String(name).toLowerCase()
    const key = Object.keys(properties).find(k => k.toLowerCase() === lower)
    return key === undefined ? undefined : properties[key]
}


const useMapStore =  defineStore('map',{
    state:()=>({
            currentYear:2023,
            currentMonth:1,
            map: null,
            yearInfo:[],
            monthInfo:[],
            featureInfo:[],
            cropInfo:[],
            imageryInfo:[],
            topoInfo:[], // 地形图信息
            yearPlayer: {},
            monthPlayer: {},
            isYearPlaying:false,
            isMonthPlaying:false,
            is3D:false,
            cropClassificationLayers:[],
            
            basinBoundaryUrl:'', // 用于将流域边界shp的url传递给3D视图
            basinBasicLayer:new Layer({}), // 流域底图layer
            basinBoundaryLayer:new Layer({}), // 流域边界layer
            basinMaskLayer:new Layer({}), // 流域遮罩layer
            basinLabelLayer:new Layer({}), // 流域标签layer
            agriParcelLayer:new Layer({}), // 农田地块layer

            // 农田地块边界与交点叠加
            parcelBoundaryLayer:new Layer({}), // 地块红色边界层
            parcelJunctionLayer:new Layer({}), // 地块边界交点标注层
            parcelBoundaryEnabled:false, // 叠加层开关
            parcelBoundaryLoading:false, // 是否正在取数
            parcelBoundaryNotice:'', // 取数受限时的提示
            parcelBoundaryCount:0, // 当前参与渲染的地块数
            parcelJunctionCount:0, // 当前标注的交点数
            parcelBoundaryMoveKey:null, // moveend 监听句柄
            parcelBoundaryTimer:null, // 防抖定时器
            parcelBoundaryReqId:0, // 请求序号，用于丢弃过期响应

            // 农田页日期时间轴
            parcelTimelineDates:[], // 可选日期，元素为 'YYYY-MM-DD' 或 {date, layer}
            parcelTimelineSource:null, // 数据源配置，接入数据时设置
            parcelTimelineLayer:new Layer({}), // 当前日期对应的图层
            parcelTimelineIndex:0, // 当前选中的日期下标
            parcelTimelinePlaying:false, // 是否正在自动播放
            parcelTimelineLoading:false, // 是否正在取数
            parcelTimelineNotice:'', // 状态提示
            parcelTimelineTimer:null, // 播放定时器
            parcelTimelineApplyTimer:null, // 拖动防抖定时器
            parcelTimelineReqId:0, // 请求序号，用于丢弃过期响应

            // 框选截取
            parcelRoiState:'idle', // idle 未启用 / drawing 待框选 / applied 已框选
            parcelRoiMaskLayer:new Layer({}), // 选区外的遮罩
            parcelRoiOutlineLayer:new Layer({}), // 选区边框
            parcelRoiDrawer:null, // 划框的交互
            parcelRoiSketchLayer:null, // 划框过程中的预览图层
            parcelRoiSketchSource:null, // 预览图层的数据源
            parcelRoiBoxSource:null, // 选区要素的数据源（框选后可以拖）
            parcelRoiMaskSource:null, // 遮罩要素的数据源
            parcelRoiRefs:null, // 当前选区的几何引用（{boxGeometry, maskFeature, worldRing}）
            parcelRoiDrag:null, // 拖动选区的交互
            parcelRoiExtent:null, // 选区范围（视图投影）
            parcelRoiPrevView:null, // 取消时用来还原视图

            // 作物结构分析
            cropAnalysisYears:{...CROP_ANALYSIS_DEFAULT_YEARS}, // 年份 -> 图层名
            cropAnalysisYearsLoaded:[], // 实际取到数据的年份
            cropAnalysisResult:null, // 算好的统计结果
            cropAnalysisLoading:false,
            cropAnalysisNotice:'',
            cropAnalysisExtent:null, // 这份统计对应的选区
            cropAnalysisScope:'full', // full 整个流域 / roi 框选范围
            cropAnalysisFullResult:null, // 整个流域的结果缓存，避免每次取消框选都重取
            cropAnalysisPendingKey:'', // 正在取数的范围标识，用来去重
            cropAnalysisReqId:0,

            // 地区下拉框
            parcelRegions:[], // 可选地区
            parcelRegionId:PARCEL_REGION_ALL_ID, // 当前选中的地区
            parcelRegionAllId:PARCEL_REGION_ALL_ID, // “全部”那一项的 id
            parcelRegionAllView:null, // “全部”对应的视图，不设就用 PARCEL_DEFAULT_VIEW
            parcelRegionPlaceholder:false, // 是否用的内置占位地区

            timeLayer: new Layer({}),
            landLayer:new Layer({}),
            colorLayer:new Layer({}),
            cropLayer:new Layer({}), // 农作物layer
            basicLayer:new Layer({}),
            cropLandLayer:new Layer({}),
            cropLayerLine:new Layer({}),
            huanTaiLandLayer:new Layer({}),
            huanTaiColorLayer:new Layer({}),
            administrativeLayer:new Layer({}),
            cropImageryLayers:[{},{}],
            clickItem:-1, // 当前选中的要素ID
            featureId:0,
            currentCrop:'',
            cropList:['other','wheat','corn','vegetable'], // 作物类型

            // currentTopo: '', // 当前选中的地形图要素
            isShowFeautureInfo:false,
            clickChoose:{},
            baseUrl:process.env.VUE_APP_GEOSERVER_URL,
            cropWaterShowCylinder:true,
            cropWaterActiveMetric:'blueWater',
            cropWaterActiveDate:'2019-04-18',
            cropWaterActiveCrop:'cotton',
            cropWaterViewportCrop:'wheat',
            cropWaterFocusCrop:null,
            cropWaterFocusRequestId:0,
            cropWaterSummaryData:null,
            cropWaterIsPlaying:false,
            cropWaterLockViewport:false,
    }),
    actions:{
        //网络请求接口
        loadingInfo(name){
            return axios.get(`/static/${name}.json`)
        },

        //获取作物信息
        getAndLoadCropInfo:async function(){
            try {
                let res = await this.loadingInfo('crop')
                this.cropInfo = res.data
                console.log("作物信息：", this.cropInfo);
                
                // this.addCropLandLayer()
                // this.addCropImageryLayers()
                this.loadCrop(this.cropInfo)
            }catch(error){
                alert("无法获取作物数据")
            }
        },

        //获取要素信息
        getFeatureInfo:async function(){
            try {
                let res = await this.loadingInfo('featureInfo')
                this.featureInfo = res.data
                this.loadFeature(this.featureInfo)
            }catch(error){
                alert("无法获取地理要素数据")
            }
        },

        //获取图层类型信息
        getImageryInfo:async function(){
            try {
                let res = await this.loadingInfo('imageInfo')
                this.imageryInfo= res.data
                // this.addHuanTaiLand()
                // this.addHuanTaiColor(0)
            }catch(error){
                alert("无法获取地表图层数据")
            }
        },

        //获取地形图信息
        getTopoInfo:async function(){
            try {
                let res = await this.loadingInfo('topoInfo')
                this.topoInfo = res.data
                // this.loadTopo(this.topoInfo)
            }catch(error){
                alert("无法获取地形图数据")
            }
        },
        getYearInfo:async function(){
            try {
                let res = await this.loadingInfo('yearInfo')
                this.yearInfo = res.data
            }catch(error){
                alert("无法获取年份数据")
            }
        },

        //获取月份表
        getMonthInfo:async function(){
            try{
                let res = await this.loadingInfo('monthInfo')
                this.monthInfo = res.data
            }catch(error){
                alert("无法获取月份数据")
            }
        },

        //载入要素信息
        loadFeature:function(list){
            list.forEach((item)=>{
                // this.addFeatureLayer([])
            })
        },

        //载入颜色信息
        loadColor:function(color){
            let info={"fillColor": color,"opacity": "0.5", "strokeColor": "#000000", "strokeWidth": "0.1"}
            this.addColorLayer(info)
        },

        //载入作物信息
        loadCrop:function(crop){
            let cropOpacityInfo ={other:0,wheat:0,corn:0,vegetable:0}
            crop.forEach((item)=>{
                console.log(item);
                if(item.index===0){
                    cropOpacityInfo.other=1
                }
                else if(item.index===1){
                    cropOpacityInfo.wheat=1
                }
                else if(item.index===2){
                    cropOpacityInfo.corn=1
                }
                else if(item.index===3){
                    cropOpacityInfo.vegetable=1
                }
            })
            // console.log(cropOpacityInfo);
            
            // alert([cropOpacityInfo.other,cropOpacityInfo.cotton,cropOpacityInfo.corn,cropOpacityInfo.wheat])
            this.addCropLayer(cropOpacityInfo)
        },




        // 添加基础图层
        // params: {type: ArcGIS的图层类型}
        // type: World_Topo_Map | World_Imagery | World_Street_Map | World_Terrain_Base | World_Shaded_Relief | 
        //       World_Physical_Map | NatGeo_World_Map | World_Ocean_Base | World_Boundaries_and_Places ...
        addBasicLayer:function(type='World_Imagery'){
            const URL = `https://server.arcgisonline.com/ArcGIS/rest/services/${type}/MapServer/tile/{z}/{y}/{x}`
            const layer = new Tile({
                source:new XYZ({
                    url: URL,
                    crossOrigin: "anonymous"
                })
            });


            this.clearMap(0);
            this.basicLayer = layer;
            if(this.map && this.map.addLayer) this.map.addLayer(this.basicLayer);
        },

        // 添加时间序列图层
        addTimeData:async function({year,month}){
            console.log(this.baseUrl)
            try{
                let res =  await axios({
                    headers:{
                        "Content-Type":"application/json; charset=utf-8",
                        "Accept": "application/json",
                        "Authorization": "Basic " + btoa("admin:geoserver")
                    },
                    url:`${this.baseUrl}/geoserver/rest/workspaces/test/coveragestores/changji_${year}${month}/coverages/changji_${year}${month}.json`,
                    method:'get',
                    data:{},
                })
                let info   = res.data.coverage.latLonBoundingBox
                const Source = new TileWMS({
                    url:`${this.baseUrl}/geoserver/test/wms`,
                    params: {
                        LAYERS: `test:changji_${year}${month}`,
                        VERSION: '1.1.1',
                        TILED: true,
                        STYLES:'resetChannel'
                    },
                    projection:info.crs,
                    serverType:'geoserver'
                })
                const timeLayer = new Tile({
                    source:Source
                })
                // this.clearMap(0)
                this.removeCropImageryLayers()
                this.removeCropLayer()
                this.removeCropLayerLine()
                this.removeTimeData()
                this.timeLayer = timeLayer
                // this.map.addLayer(this.timeLayer)
                this.addAdministrativeLayer()
                this.map.getLayers().insertAt(1,this.timeLayer)
            }catch(err){
                clearInterval(this.yearPlayer)
                clearInterval(this.monthPlayer)
                this.isYearPlaying=false,
                this.isMonthPlaying=false,
                alert(`无法获取对应${year}年${month}月的数据`)
            }
        },

        // 添加作物底图
        addCropLandLayer:function(){
            const cropLandSource = new TileWMS({
                url:`${this.baseUrl}/geoserver/test/wms`,
                params:{
                    // LAYERS:'test:huantai_landmass',
                    LAYERS:'test:changji_layer_0',
                    VERSION:'1.1.1',
                    TILED:true,
                    // STYLES:'resetChannel'
                },
                projection:'EPSG:4326',
                serverType:'geoserver'
            })
            const cropLandLayer = new Tile({
                source:cropLandSource,
            })
            // this.clearMap(0)
            this.cropLandLayer=cropLandLayer
            this.map.addLayer(this.cropLandLayer)
        },


        // 作物的影像底图
        addCropImageryLayers:function(){
            if(!this.map || !this.map.addLayer) return
            let i=0;
            // console.log(this.cropImageryLayers)
            this.cropImageryLayers.forEach(layer=>{
                if(Object.keys(layer).length !== 0){
                    this.map.addLayer(layer)
                    i++;
                    // return layer;
                }else{
                    const cropLandSource = new TileWMS({
                        url:`${this.baseUrl}/geoserver/test/wms`,
                        params:{
                            // LAYERS:'test:huantai_landmass',
                            LAYERS:`test:changji_layer_${i}`,
                            VERSION:'1.1.1',
                            TILED:true,
                            // STYLES:'resetChannel'
                        },
                        projection:'EPSG:4326',
                        serverType:'geoserver'
                    })
                    const cropLandLayer = new Tile({
                        source:cropLandSource,
                    })
                    this.map.addLayer(cropLandLayer)
                    // return cropLandLayer;
                    this.cropImageryLayers[i]=cropLandLayer;
                    i++;
                }

            })
        },

        // 作物边界
        addCropLayerLine:function(){
            if(!this.map || !this.map.addLayer) return
            const Source = new TileWMS({
                url:`${this.baseUrl}/geoserver/test/wms`,
                params:{
                    LAYERS:'test:changji_parcel_shp',
                    VERSION: '1.1.1',
                    TILED: true,
                    STYLES:'crop_line',
                },
                projection:'EPSG:4326',
                serverType:'geoserver'
            })
            const cropLayerLine = new Tile({
                source:Source,
            })
            // this.clearMap(0)
            this.cropLayerLine = cropLayerLine
            this.map.addLayer(this.cropLayerLine)
        },

        removeCropLayerLine:function(){
            if(!this.map || !this.map.removeLayer) return
            this.map.removeLayer(this.cropLayerLine)
        },

        // 添加农作物图层
        // {param: {所有作物类型}}
        addCropLayer:function({other, wheat, corn, vegetable}){
            // console.log("作物选择", wheat, corn, vegetable, other);
            
            if(!this.map || !this.map.addLayer) return
            

            // this.map.removeLayer(this.cropLandLayer)
            const source = new TileWMS({
                url:`${this.baseUrl}/geoserver/agri-agent/wms`,
                params: {
                    LAYERS:'agri-agent:bh_crop_class',
                    VERSION: '1.1.1',
                    TILED: true,
                    STYLES:'agri-agent:crop-style',
                    env:`other:${other};wheat:${wheat};corn:${corn};vegetable:${vegetable}`, // 利用env参数选择展示单个作物
                                                                                             // 默认展示所有作物
                                                                                             // 例：env:other:0;wheat:1;corn:0;vegetable:0，则展示小麦
                },
                projection:'EPSG:4326',
                serverType:'geoserver'
            })

            const cropLayer = new Tile({
                source:source
            })


            let viewResolution = this.map.getView().getResolution();
            let store = useMapStore()
            let{currentCrop,featureId,cropList,isShowFeautureInfo} = storeToRefs(store)
            if(Object.getOwnPropertyNames(this.clickChoose).length!==0){
                unByKey(this.clickChoose)
            }
            //每次加载图层前一定要重新添加点选，否则会出现按钮叠加，会报错
            this.clickChoose = this.map.on('singleclick', function(evt) {
                // 正在画框时不去查要素，免得和框选操作抢事件
                if (store.parcelRoiState === 'drawing') return
                let url = source.getFeatureInfoUrl(
                    evt.coordinate, viewResolution, 'EPSG:4326',
                    {
                        'INFO_FORMAT': 'application/json'
                    }); // 这里可以根据需要调整返回信息的格式

                if (url) {
                    fetch(url)
                        .then(function (response) {
                            return response.json();
                        })
                        .then(function (json) {
                            // 这里处理返回的信息，例如弹窗显示
                            // 点到没有作物的位置时 features 是空数组，这里要挡一下
                            const feature = json && json.features && json.features[0]
                            if (!feature || !feature.properties) return
                            // console.log(feature.properties)
                            // 用统一的取名方法，编码超出图例范围时也能显示成“类型N”
                            currentCrop.value = store.cropAnalysisTypeName(
                                Number(readFeatureProperty(feature.properties, 'Max_gridco'))
                            )
                            featureId.value = readFeatureProperty(feature.properties, 'FID_1')
                            // console.log(currentCrop.value,featureId.value)
                            if(!isShowFeautureInfo.value){
                                isShowFeautureInfo.value = !isShowFeautureInfo.value
                            }
                        })
                        .catch(function (err) {
                            console.warn('作物要素点选失败：', err)
                        });
                }
            });
            this.removeTimeData()
            this.removeCropLayer()
            // this.clearMap(2)
            this.cropLayer = cropLayer
            this.map.addLayer(this.cropLayer)
        },

        // 行政区矢量边界
        addAdministrativeLayer:function(){
            if(!this.map || !this.map.addLayer) return
            const source = new TileWMS({
                url:`${this.baseUrl}/geoserver/test/wms`,
                params: {
                    // LAYERS:'test:huantai_croptype',
                    LAYERS:'test:changji_administrative_shp',
                    VERSION: '1.1.1',
                    TILED: true,
                    STYLES:'changji_administrative',
                    // env:`other:${other};wheat:${wheat};cotton:${cotton};corn:${corn};fruit:${fruit}`,
                    // env:`other:${other};wheat:${wheat};fallow:${fallow};oilseed:${oilseed};orange:${orange}`;
                },
                projection:'EPSG:4326',
                serverType:'geoserver'
            })
            const administratorLayer = new Tile({
                source:source
            })
            this.administrativeLayer = administratorLayer
            this.map.addLayer(this.administrativeLayer)
        },


        

        // 添加农田地块（多个shp）
        // addAgriParcelLayer:function(){
        //     if(!this.map || !this.map.addLayer) return

        //     // 10 个图层名称（workspace:layer）
        //     const layers = [
        //         'agri-agent:agri-parcel-liyv-1',
        //         'agri-agent:agri-parcel-liyv-2',
        //         'agri-agent:agri-parcel-liyv-3',
        //         'agri-agent:agri-parcel-liyv-4',
        //         'agri-agent:agri-parcel-bu8',
        //         'agri-agent:agri-parcel-bu9',
        //         'agri-agent:agri-parcel-bu11',
        //         'agri-agent:agri-parcel-bu12',
        //         'agri-agent:agri-parcel-bu13',
        //         'agri-agent:agri-parcel-bu101'
        //     ]

        //     const layersParam = layers.join(',')
        //     const wmsUrl = `${this.baseUrl}/geoserver/agri-agent/wms`
        //     const params = {
        //         LAYERS: layersParam,
        //         VERSION: '1.1.1',
        //         TILED: true,
        //     }

        //     // 获取数据源
        //     const parcelSource = new TileWMS({
        //         url: wmsUrl,
        //         params: params,
        //         projection: 'EPSG:4326',
        //         serverType: 'geoserver'
        //     })
        //     // 创建layer
        //     const parcelLayer = new Tile({
        //         source: parcelSource,
        //         zIndex: 50
        //     })

        //     // 移除之前可能存在的同类图层
        //     this.removeAgriParcelLayer()
        //     this.agriParcelLayer = parcelLayer
        //     this.map.addLayer(this.agriParcelLayer)
        // },


        // 添加农田地块
        addAgriParcelLayer: function() {
            if (!this.map || !this.map.addLayer) return       


            const parcelSource = new TileWMS({
                url: `${this.baseUrl}/geoserver/agri-agent/wms`,
                params:{
                    LAYERS: PARCEL_LAYER_NAME,
                    VERSION: '1.1.1',
                    TILED: true,
                    STYLES: 'red-polygon'
                },
                projection: 'EPSG:4326',
                serverType: 'geoserver'
            })
            
            const parcelLayer = new Tile({
                source: parcelSource,
                zIndex: 50
            })


            this.removeAgriParcelLayer()
            this.agriParcelLayer = parcelLayer
            this.map.addLayer(this.agriParcelLayer)
        },


        // 移除农田地块
        removeAgriParcelLayer:function(){
            if(!this.map || !this.map.removeLayer) return
            try{
                if(this.agriParcelLayer && Object.getOwnPropertyNames(this.agriParcelLayer).length!==0){
                    this.map.removeLayer(this.agriParcelLayer)
                    this.agriParcelLayer = new Layer({})
                }
            }catch(e){console.warn(e)}
        },

        // ============ 农田地块边界与交点叠加 ============
        // 把当前视图范围内的地块取回来，沿每个地块的外环画红色边线，
        // 并把被两个及以上地块共同占用的顶点标成交点。

        // 当前视图范围，转成 EPSG:4326 的经纬度范围
        getViewExtentLonLat:function(){
            if(!this.map || !this.map.getView || !this.map.getSize) return null
            const view = this.map.getView()
            const extent = view.calculateExtent(this.map.getSize())
            if(!extent) return null
            return transformExtent(extent, view.getProjection(), 'EPSG:4326')
        },

        // 找出被两个及以上地块共用的顶点，即地块之间的交点。
        // 顶点先按 snap 精度归并到一个栅格键上，避免浮点误差导致同一个点算成两个。
        findParcelJunctions:function(geojson, snap){
            const bucket = new Map()
            const features = (geojson && geojson.features) || []
            for(let i = 0; i < features.length; i++){
                const geom = features[i] && features[i].geometry
                if(!geom || !geom.coordinates) continue
                const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
                if(!Array.isArray(polygons)) continue
                const seen = new Set() // 同一个地块内的重复顶点只算一次
                for(const polygon of polygons){
                    if(!Array.isArray(polygon)) continue
                    for(const ring of polygon){
                        if(!Array.isArray(ring)) continue
                        for(const coord of ring){
                            if(!Array.isArray(coord) || coord.length < 2) continue
                            const key = Math.round(coord[0] / snap) + ',' + Math.round(coord[1] / snap)
                            if(seen.has(key)) continue
                            seen.add(key)
                            let item = bucket.get(key)
                            if(!item){
                                item = {x: coord[0], y: coord[1], owners: new Set()}
                                bucket.set(key, item)
                            }
                            item.owners.add(i)
                        }
                    }
                }
            }
            const points = []
            bucket.forEach(item => {
                if(item.owners.size >= 2) points.push([item.x, item.y])
            })
            return points
        },

        // 开关叠加层
        toggleParcelBoundaryOverlay:function(){
            if(this.parcelBoundaryEnabled){
                this.removeParcelBoundaryOverlay()
            }else{
                this.addParcelBoundaryOverlay()
            }
        },

        addParcelBoundaryOverlay:function(){
            if(!this.map || !this.map.addLayer) return
            this.parcelBoundaryEnabled = true
            this.parcelBoundaryNotice = ''
            // 地图移动后重新取数，加防抖，避免拖动一次打一串请求
            if(this.map.on && !this.parcelBoundaryMoveKey){
                this.parcelBoundaryMoveKey = this.map.on('moveend', () => {
                    if(!this.parcelBoundaryEnabled) return
                    if(this.parcelBoundaryTimer) clearTimeout(this.parcelBoundaryTimer)
                    this.parcelBoundaryTimer = setTimeout(() => {
                        this.parcelBoundaryTimer = null
                        this.refreshParcelBoundaryOverlay()
                    }, PARCEL_REFRESH_DELAY)
                })
            }
            this.refreshParcelBoundaryOverlay()
        },

        removeParcelBoundaryOverlay:function(){
            this.parcelBoundaryEnabled = false
            this.parcelBoundaryLoading = false
            this.parcelBoundaryNotice = ''
            this.parcelBoundaryCount = 0
            this.parcelJunctionCount = 0
            if(this.parcelBoundaryTimer){
                clearTimeout(this.parcelBoundaryTimer)
                this.parcelBoundaryTimer = null
            }
            if(this.parcelBoundaryMoveKey){
                unByKey(this.parcelBoundaryMoveKey)
                this.parcelBoundaryMoveKey = null
            }
            this.parcelBoundaryReqId++
            this.removeParcelBoundaryLayers()
        },

        removeParcelBoundaryLayers:function(){
            if(!this.map || !this.map.removeLayer) return
            try{
                if(Object.getOwnPropertyNames(this.parcelBoundaryLayer).length !== 1){
                    this.map.removeLayer(this.parcelBoundaryLayer)
                }
            }catch(e){console.warn(e)}
            try{
                if(Object.getOwnPropertyNames(this.parcelJunctionLayer).length !== 1){
                    this.map.removeLayer(this.parcelJunctionLayer)
                }
            }catch(e){console.warn(e)}
            this.parcelBoundaryLayer = new Layer({})
            this.parcelJunctionLayer = new Layer({})
        },

        refreshParcelBoundaryOverlay:async function(){
            if(!this.parcelBoundaryEnabled || !this.map) return
            const extent = this.getViewExtentLonLat()
            if(!extent) return

            // 范围太大时要素数量会失控，先不取数，提示用户放大
            const span = Math.max(extent[2] - extent[0], extent[3] - extent[1])
            if(span > PARCEL_MAX_SPAN){
                this.removeParcelBoundaryLayers()
                this.parcelBoundaryCount = 0
                this.parcelJunctionCount = 0
                this.parcelBoundaryNotice = '请放大地图后查看地块边界'
                return
            }

            const reqId = ++this.parcelBoundaryReqId
            this.parcelBoundaryLoading = true
            this.parcelBoundaryNotice = ''
            try{
                const url = `${this.baseUrl}/geoserver/agri-agent/ows`
                    + `?service=WFS&version=1.0.0&request=GetFeature`
                    + `&typeName=${PARCEL_LAYER_NAME}`
                    + `&outputFormat=application/json`
                    + `&maxFeatures=${PARCEL_MAX_FEATURES}`
                    + `&bbox=${extent[0]},${extent[1]},${extent[2]},${extent[3]}`
                const res = await axios.get(url, {timeout:60000})
                if(reqId !== this.parcelBoundaryReqId) return // 已有更新的请求，丢弃这次结果

                const data = res.data
                // GeoServer 出错时返回 200 加一份 XML 异常，这里挡一下
                if(typeof data === 'string' && data.trim().charAt(0) === '<'){
                    console.warn('地块边界取数失败：', data.slice(0, 500))
                    this.removeParcelBoundaryLayers()
                    this.parcelBoundaryCount = 0
                    this.parcelJunctionCount = 0
                    this.parcelBoundaryNotice = '地块服务返回异常'
                    return
                }

                const geojson = typeof data === 'string' ? JSON.parse(data) : data
                const count = (geojson.features || []).length
                const projection = this.map.getView().getProjection()
                const features = new GeoJSON().readFeatures(geojson, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: projection
                })

                // 红色边线，只描边不填充，避免盖住底图影像
                const boundaryLayer = new VectorLayer({
                    source: new VectorSource({features}),
                    zIndex: 60,
                    style: new Style({
                        stroke: new Stroke({color: 'rgba(255,0,0,0.9)', width: 1.2}),
                        fill: null
                    })
                })

                const junctions = this.findParcelJunctions(geojson, PARCEL_SNAP)
                const junctionFeatures = junctions.map(coordinate =>
                    new Feature({geometry: new Point(fromLonLat(coordinate, projection))})
                )
                const junctionLayer = new VectorLayer({
                    source: new VectorSource({features: junctionFeatures}),
                    zIndex: 61,
                    style: new Style({
                        image: new Circle({
                            radius: 3.5,
                            fill: new Fill({color: 'rgba(255,0,0,0.95)'}),
                            stroke: new Stroke({color: '#ffffff', width: 1})
                        })
                    })
                })

                this.removeParcelBoundaryLayers()
                this.parcelBoundaryLayer = boundaryLayer
                this.parcelJunctionLayer = junctionLayer
                this.map.addLayer(this.parcelBoundaryLayer)
                this.map.addLayer(this.parcelJunctionLayer)
                this.parcelBoundaryCount = count
                this.parcelJunctionCount = junctions.length
                if(count >= PARCEL_MAX_FEATURES){
                    this.parcelBoundaryNotice = '范围偏大，显示的可能不完整'
                }
            }catch(e){
                if(reqId !== this.parcelBoundaryReqId) return
                console.warn('地块边界取数失败：', e)
                this.removeParcelBoundaryLayers()
                this.parcelBoundaryCount = 0
                this.parcelJunctionCount = 0
                this.parcelBoundaryNotice = '地块数据获取失败'
            }finally{
                if(reqId === this.parcelBoundaryReqId) this.parcelBoundaryLoading = false
            }
        },

        // ============ 农田页日期时间轴 ============
        // 拖动时间轴切换日期，日期对应的图层由 parcelTimelineSource 描述。
        // 数据接入前 source 为空，拖动只更新日期显示，不发起请求。

        // 输出 YYYY-MM-DD
        formatDate:function(date){
            const pad = n => (n < 10 ? '0' + n : '' + n)
            return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
        },

        // 数据接入前用的占位日期，按 step（day/month/year）在区间内步进
        buildPlaceholderDates:function(range){
            const dates = []
            const start = new Date((range && range.start) || '2018-01-01')
            const end = new Date((range && range.end) || '2023-12-31')
            if(isNaN(start) || isNaN(end) || start > end) return dates
            const step = (range && range.step) || 'month'
            const cursor = new Date(start)
            while(cursor <= end && dates.length < 5000){
                dates.push(this.formatDate(cursor))
                if(step === 'day'){
                    cursor.setDate(cursor.getDate() + 1)
                }else if(step === 'year'){
                    cursor.setFullYear(cursor.getFullYear() + 1)
                }else{
                    cursor.setDate(1) // 先归到月初，避免 1 月 31 日加一个月跳到 3 月
                    cursor.setMonth(cursor.getMonth() + 1)
                }
            }
            return dates
        },

        // 读取日期列表：优先用 /static/parcelTimeline.json，读不到就用占位区间
        getParcelTimelineDates:async function(){
            let dates = []
            try{
                const res = await axios.get('/static/parcelTimeline.json')
                if(Array.isArray(res.data)) dates = res.data
            }catch(e){
                dates = []
            }
            dates = dates
                .map(item => (typeof item === 'string' ? item : (item && item.date)))
                .filter(Boolean)
            if(dates.length === 0){
                // 数据还没接入，先用占位日期把交互跑起来
                this.setParcelTimelineDates(this.buildPlaceholderDates(PARCEL_TIMELINE_DEFAULT_RANGE))
                this.parcelTimelineNotice = '占位日期'
                return
            }
            this.setParcelTimelineDates(dates)
        },

        // 数据接入接口。dates 支持两种写法：
        //   ['2023-05-01', '2023-06-01', ...]
        //   [{date:'2023-05-01', layer:'agri-agent:parcel_20230501'}, ...]
        // source 描述怎么把日期变成图层：
        //   {type:'wms', url:'http://host:8080/geoserver/xxx/wms',
        //    layerTemplate:'agri-agent:parcel_{ymd}', styles:'', version:'1.1.1',
        //    projection:'EPSG:4326', zIndex:5}
        // layerTemplate 支持 {date} {year} {month} {day} {ymd} 占位符；
        // dates 里带 layer 的条目优先用自带的图层名，不再套模板。
        setParcelTimelineDates:function(dates, source){
            this.parcelTimelineDates = Array.isArray(dates) ? dates.slice() : []
            if(source !== undefined) this.parcelTimelineSource = source
            if(this.parcelTimelineIndex >= this.parcelTimelineDates.length){
                this.parcelTimelineIndex = Math.max(0, this.parcelTimelineDates.length - 1)
            }
            this.applyParcelTimelineDate()
        },

        // 日期列表里第 index 条对应的日期字符串，形如 2023-05-01
        getParcelDateAt:function(index){
            const item = this.parcelTimelineDates[index]
            if(!item) return ''
            return typeof item === 'string' ? item : (item.date || '')
        },

        // 当前选中的日期
        getCurrentParcelDate:function(){
            return this.getParcelDateAt(this.parcelTimelineIndex)
        },

        // 拖动时间轴：先更新下标让界面跟手，取数做防抖
        selectParcelTimelineIndex:function(index){
            const max = this.parcelTimelineDates.length - 1
            if(max < 0) return
            const next = Math.min(Math.max(Number(index) || 0, 0), max)
            if(next === this.parcelTimelineIndex) return
            this.parcelTimelineIndex = next
            if(this.parcelTimelineApplyTimer) clearTimeout(this.parcelTimelineApplyTimer)
            this.parcelTimelineApplyTimer = setTimeout(() => {
                this.parcelTimelineApplyTimer = null
                this.applyParcelTimelineDate()
            }, PARCEL_TIMELINE_DEBOUNCE)
        },

        // 精确落到某一天（日期选择器用）。命中了就用那天，没命中取最接近的一天
        selectParcelTimelineDate:function(date){
            const list = this.parcelTimelineDates
            if(!list.length || !date) return
            let best = 0
            let bestDiff = Infinity
            for(let i = 0; i < list.length; i++){
                const value = this.getParcelDateAt(i)
                if(!value) continue
                if(value === date){
                    best = i
                    break
                }
                const diff = Math.abs(new Date(value) - new Date(date))
                if(diff < bestDiff){
                    bestDiff = diff
                    best = i
                }
            }
            this.selectParcelTimelineIndex(best)
        },

        // 把模板里的日期占位符替换掉
        resolveParcelLayerName:function(template, date){
            const parts = String(date || '').split('-')
            return String(template || '')
                .replace(/\{date\}/g, date || '')
                .replace(/\{year\}/g, parts[0] || '')
                .replace(/\{month\}/g, parts[1] || '')
                .replace(/\{day\}/g, parts[2] || '')
                .replace(/\{ymd\}/g, (parts[0] || '') + (parts[1] || '') + (parts[2] || ''))
        },

        // 按当前日期换图。没有配置数据源时只更新状态，方便先看交互
        applyParcelTimelineDate:async function(){
            const date = this.getCurrentParcelDate()
            if(!date) return
            this.removeParcelTimelineLayer()
            if(!this.parcelTimelineSource){
                this.parcelTimelineNotice = '数据未接入'
                return
            }

            const reqId = ++this.parcelTimelineReqId
            this.parcelTimelineLoading = true
            this.parcelTimelineNotice = ''
            try{
                const source = this.parcelTimelineSource
                const item = this.parcelTimelineDates[this.parcelTimelineIndex]
                const layerName = (item && typeof item === 'object' && item.layer)
                    || this.resolveParcelLayerName(source.layerTemplate, date)
                if(!source.url || !layerName) throw new Error('数据源配置不完整')

                const wmsSource = new TileWMS({
                    url: source.url,
                    params:{
                        LAYERS: layerName,
                        VERSION: source.version || '1.1.1',
                        TILED: true,
                        STYLES: source.styles || ''
                    },
                    projection: source.projection || 'EPSG:4326',
                    serverType: 'geoserver'
                })
                const layer = new Tile({
                    source: wmsSource,
                    zIndex: source.zIndex || 5
                })
                if(reqId !== this.parcelTimelineReqId) return // 已有更新的日期，丢弃这次结果
                this.parcelTimelineLayer = layer
                if(this.map && this.map.addLayer) this.map.addLayer(layer)
            }catch(e){
                console.warn('日期图层加载失败：', e)
                this.parcelTimelineNotice = '该日期暂无数据'
            }finally{
                if(reqId === this.parcelTimelineReqId) this.parcelTimelineLoading = false
            }
        },

        removeParcelTimelineLayer:function(){
            if(!this.map || !this.map.removeLayer) return
            try{
                if(Object.getOwnPropertyNames(this.parcelTimelineLayer).length !== 1){
                    this.map.removeLayer(this.parcelTimelineLayer)
                }
            }catch(e){console.warn(e)}
            this.parcelTimelineLayer = new Layer({})
        },

        toggleParcelTimelinePlay:function(){
            if(this.parcelTimelinePlaying){
                this.stopParcelTimelinePlay()
                return
            }
            if(this.parcelTimelineDates.length < 2) return
            this.parcelTimelinePlaying = true
            this.parcelTimelineTimer = setInterval(() => {
                const next = (this.parcelTimelineIndex + 1) % this.parcelTimelineDates.length
                this.parcelTimelineIndex = next
                this.applyParcelTimelineDate()
            }, PARCEL_TIMELINE_PLAY_INTERVAL)
        },

        stopParcelTimelinePlay:function(){
            this.parcelTimelinePlaying = false
            if(this.parcelTimelineTimer){
                clearInterval(this.parcelTimelineTimer)
                this.parcelTimelineTimer = null
            }
        },

        // ============ 框选截取 ============
        // 拖出矩形后自动缩放居中，矩形以外统一盖成灰色、不显示任何数据。
        // 不点“取消框选”就可以一直框选下去；按住选区的边框可以整体拖动它。

        setMapCursor:function(cursor){
            if(!this.map || !this.map.getTargetElement) return
            const target = this.map.getTargetElement()
            if(target && target.style) target.style.cursor = cursor || ''
        },

        toggleParcelRoi:function(){
            if(this.parcelRoiState === 'idle'){
                this.startParcelRoiDraw()
            }else{
                this.clearParcelRoi()
            }
        },

        // 进入框选模式。这个模式会一直开着，直到点“取消框选”
        startParcelRoiDraw:function(){
            if(!this.map || !this.map.addInteraction) return
            this.stopParcelRoi()
            this.clearParcelRoiLayers()

            // 画框和拖动都用自己写的交互。ol 自带的 Draw 在这个页面里收不到指针事件，
            // 实测拖拽会变成地图平移，所以不走它。
            this.parcelRoiDrawer = this.createParcelRoiDrawer()
            this.map.addInteraction(this.parcelRoiDrawer)
            // 拖动交互后加，OpenLayers 会先问它：按住边框才拖动，其余位置交回给画框
            this.parcelRoiDrag = this.createParcelRoiDrag()
            this.map.addInteraction(this.parcelRoiDrag)

            this.setMapCursor('crosshair')
            this.parcelRoiState = 'drawing'
        },

        // 按下拉框，拖动实时预览，松手应用
        createParcelRoiDrawer:function(){
            const self = this
            const state = {start: null}
            const toExtent = coordinate => [
                Math.min(state.start[0], coordinate[0]),
                Math.min(state.start[1], coordinate[1]),
                Math.max(state.start[0], coordinate[0]),
                Math.max(state.start[1], coordinate[1])
            ]
            return new PointerInteraction({
                handleDownEvent: evt => {
                    state.start = evt.coordinate.slice()
                    self.showParcelRoiSketch(toExtent(evt.coordinate))
                    return true
                },
                handleDragEvent: evt => {
                    if(!state.start) return
                    self.showParcelRoiSketch(toExtent(evt.coordinate))
                },
                handleUpEvent: evt => {
                    if(!state.start) return false
                    const extent = toExtent(evt.coordinate)
                    state.start = null
                    self.hideParcelRoiSketch()
                    if(self.isParcelRoiExtentUsable(extent)) self.applyParcelRoi(extent)
                    return false
                }
            })
        },

        // 拉框过程中的预览框
        showParcelRoiSketch:function(extent){
            if(!this.map || !this.map.addLayer) return
            const ring = this.extentToRing(extent)
            if(this.parcelRoiSketchSource){
                const feature = this.parcelRoiSketchSource.getFeatures()[0]
                if(feature) feature.getGeometry().setCoordinates([ring])
                return
            }
            this.parcelRoiSketchSource = new VectorSource({features: [new Feature(new Polygon([ring]))]})
            this.parcelRoiSketchLayer = new VectorLayer({
                source: this.parcelRoiSketchSource,
                zIndex: 902,
                style: new Style({
                    stroke: new Stroke({color: 'rgba(255,0,0,0.9)', width: 2}),
                    fill: new Fill({color: 'rgba(255,0,0,0.15)'})
                })
            })
            this.map.addLayer(this.parcelRoiSketchLayer)
        },

        hideParcelRoiSketch:function(){
            if(this.map && this.map.removeLayer && this.parcelRoiSketchLayer){
                try{ this.map.removeLayer(this.parcelRoiSketchLayer) }catch(e){console.warn(e)}
            }
            this.parcelRoiSketchLayer = null
            if(this.parcelRoiSketchSource){
                this.parcelRoiSketchSource.clear()
                this.parcelRoiSketchSource = null
            }
        },

        // 只有按住选区边框时才进入拖动。
        // 没用 ol 的 Translate：选区填充是透明的，它的命中检测点不到，会变成地图平移。
        createParcelRoiDrag:function(){
            const self = this
            const dragState = {start: null, ring: null}
            return new PointerInteraction({
                handleDownEvent: evt => {
                    if(!self.parcelRoiRefs) return false
                    if(!self.isOnParcelRoiEdge(evt.coordinate)) return false
                    dragState.start = evt.coordinate.slice()
                    dragState.ring = self.parcelRoiRefs.boxGeometry.getCoordinates()[0].map(point => point.slice())
                    return true
                },
                handleDragEvent: evt => {
                    const refs = self.parcelRoiRefs
                    if(!dragState.start || !refs) return
                    const dx = evt.coordinate[0] - dragState.start[0]
                    const dy = evt.coordinate[1] - dragState.start[1]
                    refs.boxGeometry.setCoordinates([
                        dragState.ring.map(point => [point[0] + dx, point[1] + dy])
                    ])
                    self.syncParcelRoi()
                },
                handleUpEvent: () => {
                    if(!dragState.start) return false
                    dragState.start = null
                    // 拖完再重算，避免拖动过程中反复取数
                    self.refreshCropAnalysis()
                    return false
                },
                handleMoveEvent: evt => {
                    if(self.parcelRoiState === 'idle') return
                    self.setMapCursor(self.isOnParcelRoiEdge(evt.coordinate) ? 'move' : 'crosshair')
                }
            })
        },

        // 指针是否落在选区的边框上，按屏幕像素算，容差 PARCEL_ROI_EDGE_TOLERANCE
        isOnParcelRoiEdge:function(coordinate){
            const refs = this.parcelRoiRefs
            if(!refs || !this.map || !this.map.getPixelFromCoordinate) return false
            const pixel = this.map.getPixelFromCoordinate(coordinate)
            if(!pixel) return false
            const ring = refs.boxGeometry.getCoordinates()[0]
            let min = Infinity
            for(let i = 1; i < ring.length; i++){
                const a = this.map.getPixelFromCoordinate(ring[i - 1])
                const b = this.map.getPixelFromCoordinate(ring[i])
                if(!a || !b) continue
                min = Math.min(min, this.distanceToSegment(pixel, a, b))
            }
            return min <= PARCEL_ROI_EDGE_TOLERANCE
        },

        distanceToSegment:function(point, a, b){
            const dx = b[0] - a[0]
            const dy = b[1] - a[1]
            const lengthSq = dx * dx + dy * dy
            let t = lengthSq === 0 ? 0 : ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq
            t = Math.min(Math.max(t, 0), 1)
            return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy))
        },

        // 把遮罩的挖空、记录的选区范围、数据图层的裁剪范围都同步到当前选区
        syncParcelRoi:function(){
            const refs = this.parcelRoiRefs
            if(!refs) return
            const ring = refs.boxGeometry.getCoordinates()[0]
            refs.maskFeature.getGeometry().setCoordinates([refs.worldRing, ring])
            this.parcelRoiExtent = refs.boxGeometry.getExtent()
            this.setParcelRoiLayerExtent(this.parcelRoiExtent)
        },

        // 数据图层按矩形裁掉，框外就不再出数据；
        // 底图和遮罩自身跳过。extent 传 null 表示恢复
        setParcelRoiLayerExtent:function(extent){
            if(!this.map || !this.map.getLayers) return
            const skip = [this.basicLayer, this.parcelRoiMaskLayer, this.parcelRoiOutlineLayer, this.parcelRoiSketchLayer]
            this.map.getLayers().forEach(layer => {
                if(!layer || skip.indexOf(layer) !== -1) return
                if(typeof layer.setExtent !== 'function') return
                layer.setExtent(extent || undefined)
            })
        },

        // 移除框选相关的交互（画框和拖动），退出模式时用
        stopParcelRoi:function(){
            if(this.map && this.map.removeInteraction){
                if(this.parcelRoiDrawer) this.map.removeInteraction(this.parcelRoiDrawer)
                if(this.parcelRoiDrag) this.map.removeInteraction(this.parcelRoiDrag)
            }
            this.parcelRoiDrawer = null
            this.parcelRoiDrag = null
            this.hideParcelRoiSketch()
            this.setMapCursor('')
        },

        // 只点一下没拖动会产生一个退化的矩形，这种直接丢掉
        isParcelRoiExtentUsable:function(extent){
            if(!extent || !this.map || !this.map.getView) return false
            const resolution = this.map.getView().getResolution() || 0
            const minSize = PARCEL_ROI_MIN_PIXELS * resolution
            return (extent[2] - extent[0]) >= minSize && (extent[3] - extent[1]) >= minSize
        },

        // 应用选区：记住原视图，缩放居中，再把选区以外盖成灰色
        applyParcelRoi:function(extent){
            if(!this.map || !this.map.getView || !extent) return
            const view = this.map.getView()
            const projection = view.getProjection()

            // 只记第一次的视图，退出时回到框选之前
            if(!this.parcelRoiPrevView){
                this.parcelRoiPrevView = {center: view.getCenter(), zoom: view.getZoom()}
            }
            view.fit(extent, {
                padding: [PARCEL_ROI_PADDING, PARCEL_ROI_PADDING, PARCEL_ROI_PADDING, PARCEL_ROI_PADDING],
                duration: 400
            })

            const worldRing = [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]
                .map(coordinate => fromLonLat(coordinate, projection))
            const ring = this.extentToRing(extent)
            const boxGeometry = new Polygon([ring])
            const maskFeature = new Feature(new Polygon([worldRing, ring]))
            // markRaw 避免 Vue 把 OpenLayers 的几何对象包成响应式的
            this.parcelRoiRefs = markRaw({boxGeometry, maskFeature, worldRing})

            // 选区和遮罩各用一个要素，选区挪动时同步更新遮罩
            const boxSource = new VectorSource({features: [new Feature(boxGeometry)]})
            const maskSource = new VectorSource({features: [maskFeature]})

            const maskLayer = new VectorLayer({
                source: maskSource,
                zIndex: 900,
                style: new Style({fill: new Fill({color: PARCEL_ROI_MASK_COLOR}), stroke: null})
            })
            const outlineLayer = new VectorLayer({
                source: boxSource,
                zIndex: 901,
                style: new Style({
                    stroke: new Stroke({color: 'rgba(255,0,0,0.9)', width: 2}),
                    fill: null
                })
            })

            this.clearParcelRoiLayers()
            this.parcelRoiMaskLayer = maskLayer
            this.parcelRoiOutlineLayer = outlineLayer
            this.parcelRoiBoxSource = boxSource
            this.parcelRoiMaskSource = maskSource
            this.map.addLayer(this.parcelRoiMaskLayer)
            this.map.addLayer(this.parcelRoiOutlineLayer)

            this.syncParcelRoi()
            this.parcelRoiState = 'applied'
            this.refreshCropAnalysis()
        },

        // 矩形范围转成闭合的环
        extentToRing:function(extent){
            return [
                [extent[0], extent[1]],
                [extent[2], extent[1]],
                [extent[2], extent[3]],
                [extent[0], extent[3]],
                [extent[0], extent[1]]
            ]
        },

        // 只清选区相关的图层，交互不动（框选模式还要继续用）
        clearParcelRoiLayers:function(){
            if(this.parcelRoiBoxSource){
                this.parcelRoiBoxSource.clear()
                this.parcelRoiBoxSource = null
            }
            if(this.parcelRoiMaskSource){
                this.parcelRoiMaskSource.clear()
                this.parcelRoiMaskSource = null
            }
            if(this.map && this.map.removeLayer){
                try{
                    if(Object.getOwnPropertyNames(this.parcelRoiMaskLayer).length !== 1){
                        this.map.removeLayer(this.parcelRoiMaskLayer)
                    }
                }catch(e){console.warn(e)}
                try{
                    if(Object.getOwnPropertyNames(this.parcelRoiOutlineLayer).length !== 1){
                        this.map.removeLayer(this.parcelRoiOutlineLayer)
                    }
                }catch(e){console.warn(e)}
            }
            this.parcelRoiMaskLayer = new Layer({})
            this.parcelRoiOutlineLayer = new Layer({})
        },

        // 退出框选：清掉交互和图层。restoreView 为 false 时不还原视图（比如切地区时用）
        clearParcelRoi:function(restoreView){
            this.stopParcelRoi()
            this.clearParcelRoiLayers()
            this.parcelRoiRefs = null
            // 恢复数据图层的显示范围
            this.setParcelRoiLayerExtent(null)
            const prev = this.parcelRoiPrevView
            if(restoreView !== false && prev && prev.center && this.map && this.map.getView){
                this.map.getView().animate({center: prev.center, zoom: prev.zoom, duration: 400})
            }
            this.parcelRoiPrevView = null
            this.parcelRoiExtent = null
            this.parcelRoiState = 'idle'
            // 选区没了，统计结果也跟着清掉
            this.refreshCropAnalysis()
        },

        // ============ 作物结构分析 ============
        // 统计范围来自框选：选区一变就重新取数重算

        // 接入多年数据的接口，形如 {2024:'图层名', 2025:'图层名'}
        setCropAnalysisYears:function(years){
            if(years && typeof years === 'object' && !Array.isArray(years)){
                this.cropAnalysisYears = {...years}
            }
            this.refreshCropAnalysis()
        },

        getCropAnalysisYears:async function(){
            try{
                const res = await axios.get('/static/cropYears.json')
                const data = res.data
                if(data && typeof data === 'object' && !Array.isArray(data)){
                    this.cropAnalysisYears = {...data}
                }
            }catch(e){
                // 没配就继续用默认的
            }
            this.refreshCropAnalysis()
        },

        // 类型编码转名称和图标。编码 4 按别名归到“其他”，
        // 其余没有对应项的用“类型N”兜底
        cropAnalysisTypeInfo:function(code){
            if(code === null || code === undefined || isNaN(code)) return {name:'未知', icon:''}
            const key = Object.prototype.hasOwnProperty.call(CROP_ANALYSIS_TYPE_ALIAS, code)
                ? CROP_ANALYSIS_TYPE_ALIAS[code]
                : code
            const info = this.cropInfo && this.cropInfo[key]
            return {
                name: (info && info.name) || ('类型' + code),
                icon: (info && info.src) || ''
            }
        },

        cropAnalysisTypeName:function(code){
            return this.cropAnalysisTypeInfo(code).name
        },

        // 按当前范围取数并重算。没有框选时统计整个流域，
        // 全流域那次的结果会缓存，取消框选时直接复用，不重复取数
        refreshCropAnalysis:async function(force){
            if(!this.map) return
            const isRoi = !!this.parcelRoiExtent
            const extent = isRoi ? this.parcelRoiExtent : CROP_ANALYSIS_FULL_EXTENT
            this.cropAnalysisScope = isRoi ? 'roi' : 'full'

            if(!isRoi && !force && this.cropAnalysisFullResult){
                this.cropAnalysisExtent = extent.slice()
                this.cropAnalysisNotice = ''
                this.cropAnalysisResult = this.cropAnalysisFullResult
                this.cropAnalysisYearsLoaded = this.cropAnalysisFullResult.loadedYears || []
                return
            }

            // 同一个范围的取数还在进行中就不要再发一次。
            // 全流域那一次有 40MB，重复发会把服务和浏览器一起拖垮。
            const pendingKey = `${isRoi ? 'roi' : 'full'}|${extent.join(',')}`
            if(!force && this.cropAnalysisLoading && this.cropAnalysisPendingKey === pendingKey){
                return
            }
            this.cropAnalysisPendingKey = pendingKey

            const reqId = ++this.cropAnalysisReqId
            this.cropAnalysisLoading = true
            this.cropAnalysisNotice = ''
            try{
                const years = Object.keys(this.cropAnalysisYears).map(Number).filter(y => !isNaN(y)).sort((a, b) => a - b)
                const records = []
                const loadedYears = []
                for(const year of years){
                    const layer = this.cropAnalysisYears[year]
                    if(!layer) continue
                    const url = `${this.baseUrl}/geoserver/agri-agent/ows`
                        + `?service=WFS&version=1.0.0&request=GetFeature`
                        + `&typeName=${layer}`
                        + `&outputFormat=application/json`
                        + `&maxFeatures=${CROP_ANALYSIS_MAX_FEATURES}`
                        + `&bbox=${extent[0]},${extent[1]},${extent[2]},${extent[3]}`
                    // 全流域有 30 多万个图斑、40MB 左右，给足时间
                    const res = await axios.get(url, {timeout:300000})
                    if(reqId !== this.cropAnalysisReqId) return
                    const data = res.data
                    // 图层不存在时 GeoServer 会回 XML 异常，跳过这一年
                    if(typeof data === 'string' && data.trim().charAt(0) === '<') continue
                    const geojson = typeof data === 'string' ? JSON.parse(data) : data
                    const features = (geojson && geojson.features) || []
                    loadedYears.push(year)
                    if(features.length >= CROP_ANALYSIS_MAX_FEATURES){
                        this.cropAnalysisNotice = '范围偏大，数据可能不完整，建议缩小框选'
                    }
                    features.forEach(feature => {
                        const props = feature && feature.properties
                        if(!props) return
                        const parcel = readFeatureProperty(props, CROP_ANALYSIS_PARCEL_FIELD)
                        records.push({
                            year,
                            parcel: parcel === undefined || parcel === null ? null : String(parcel),
                            type: Number(readFeatureProperty(props, CROP_ANALYSIS_TYPE_FIELD)),
                            area: Number(readFeatureProperty(props, CROP_ANALYSIS_AREA_FIELD)) || 0
                        })
                    })
                }
                if(reqId !== this.cropAnalysisReqId) return
                this.cropAnalysisYearsLoaded = loadedYears
                this.cropAnalysisExtent = extent.slice()
                const result = this.computeCropAnalysis(records, extent, loadedYears)
                result.loadedYears = loadedYears
                this.cropAnalysisResult = result
                // 全流域的结果缓存起来
                if(!isRoi) this.cropAnalysisFullResult = result
            }catch(e){
                console.warn('作物结构分析取数失败：', e && (e.message || e))
                this.cropAnalysisResult = null
                this.cropAnalysisNotice = '作物结构分析取数失败'
            }finally{
                if(reqId === this.cropAnalysisReqId){
                    this.cropAnalysisLoading = false
                    this.cropAnalysisPendingKey = ''
                }
            }
        },

        // 把要素记录算成统计结果
        computeCropAnalysis:function(records, extent, years){
            const sortedYears = (years || []).slice().sort((a, b) => a - b)
            // shape_area 是平方度，换算成平方公里
            const centerLat = (extent[1] + extent[3]) / 2
            const squareDegToKm2 = value => value * 111.32 * 111.32 * Math.cos(centerLat * Math.PI / 180)
            const latestYear = sortedYears.length ? sortedYears[sortedYears.length - 1] : null
            const latest = records.filter(r => r.year === latestYear)

            const typeMap = new Map()
            let totalArea = 0
            latest.forEach(r => {
                const area = squareDegToKm2(r.area)
                totalArea += area
                const item = typeMap.get(r.type) || {code: r.type, count: 0, area: 0}
                item.count += 1
                item.area += area
                typeMap.set(r.type, item)
            })
            const byType = Array.from(typeMap.values())
                .map(item => ({
                    ...item,
                    name: this.cropAnalysisTypeName(item.code),
                    ratio: totalArea ? item.area / totalArea : 0,
                    perKm2: totalArea ? item.count / totalArea : 0
                }))
                .sort((a, b) => b.area - a.area)

            const richness = byType.length
            const shannonOf = ratios => ratios.reduce((sum, p) => p > 0 ? sum - p * Math.log(p) : sum, 0)
            const simpsonOf = ratios => 1 - ratios.reduce((sum, p) => sum + p * p, 0)
            const overallRatios = byType.map(item => item.ratio)

            // 按地块统计：每个地块内部各作物类型的面积占比
            const parcelMap = new Map()
            latest.forEach(r => {
                if(!r.parcel) return
                const area = squareDegToKm2(r.area)
                const perType = parcelMap.get(r.parcel) || {total: 0, types: new Map()}
                perType.total += area
                perType.types.set(r.type, (perType.types.get(r.type) || 0) + area)
                parcelMap.set(r.parcel, perType)
            })
            let parcelShannonSum = 0
            let parcelSimpsonSum = 0
            let parcelTypesPerKm2Sum = 0
            let parcelUsable = 0
            parcelMap.forEach(perType => {
                if(!perType.total) return
                const ratios = Array.from(perType.types.values()).map(area => area / perType.total)
                parcelShannonSum += shannonOf(ratios)
                parcelSimpsonSum += simpsonOf(ratios)
                parcelTypesPerKm2Sum += perType.types.size / perType.total
                parcelUsable += 1
            })

            // 多年序列：每年取面积占比最大的作物
            const series = sortedYears.map(year => {
                const areaByType = new Map()
                let yearArea = 0
                records.forEach(r => {
                    if(r.year !== year) return
                    const area = squareDegToKm2(r.area)
                    yearArea += area
                    areaByType.set(r.type, (areaByType.get(r.type) || 0) + area)
                })
                let topCode = null
                let topArea = -1
                areaByType.forEach((area, code) => {
                    if(area > topArea){ topArea = area; topCode = code }
                })
                return {
                    year,
                    code: topCode,
                    name: topCode === null ? '暂无数据' : this.cropAnalysisTypeName(topCode),
                    ratio: yearArea ? topArea / yearArea : 0
                }
            })

            // 种植稳定性：以基准年为起点，统计每个地块作物类型改变的次数
            const stabilityYears = sortedYears.filter(y => y >= CROP_ANALYSIS_BASELINE_YEAR)
            const parcelYearType = new Map()
            records.forEach(r => {
                if(!r.parcel || !stabilityYears.includes(r.year)) return
                const area = squareDegToKm2(r.area)
                const perYear = parcelYearType.get(r.parcel) || new Map()
                const current = perYear.get(r.year)
                // 同一年同一地块可能有多个斑块，取面积最大的那一类
                if(!current || area > current.area) perYear.set(r.year, {type: r.type, area})
                parcelYearType.set(r.parcel, perYear)
            })
            let stableParcels = 0
            let changeSum = 0
            const histogram = {}
            parcelYearType.forEach(perYear => {
                const sequence = stabilityYears.map(y => perYear.get(y)).filter(Boolean).map(v => v.type)
                if(sequence.length < 2) return
                let changes = 0
                for(let i = 1; i < sequence.length; i++){
                    if(sequence[i] !== sequence[i - 1]) changes += 1
                }
                stableParcels += 1
                changeSum += changes
                histogram[changes] = (histogram[changes] || 0) + 1
            })

            return {
                years: sortedYears,
                latestYear,
                baseline: CROP_ANALYSIS_BASELINE_YEAR,
                patchCount: latest.length,
                parcelCount: parcelMap.size,
                totalArea,
                byType,
                diversity: {
                    richness,
                    shannon: shannonOf(overallRatios),
                    simpson: simpsonOf(overallRatios),
                    speciesPerKm2: totalArea ? richness / totalArea : 0,
                    parcelShannon: parcelUsable ? parcelShannonSum / parcelUsable : 0,
                    parcelSimpson: parcelUsable ? parcelSimpsonSum / parcelUsable : 0,
                    parcelTypesPerKm2: parcelUsable ? parcelTypesPerKm2Sum / parcelUsable : 0,
                    parcelUsable
                },
                series,
                stability: {
                    years: stabilityYears,
                    parcelCount: stableParcels,
                    averageChanges: stableParcels ? changeSum / stableParcels : null,
                    histogram,
                    // 少于两年没法比，界面上要提示需要补数据
                    comparable: stabilityYears.length >= 2
                }
            }
        },

        // ============ 地区下拉框 ============
        // 读地区列表：优先 /static/parcelRegions.json，读不到就用内置占位地区
        getParcelRegions:async function(){
            let list = []
            try{
                const res = await axios.get('/static/parcelRegions.json')
                if(Array.isArray(res.data)) list = res.data
            }catch(e){
                list = []
            }
            list = list.filter(item => item && item.name)
            if(list.length === 0){
                this.setParcelRegions(PARCEL_REGION_PLACEHOLDER)
                this.parcelRegionPlaceholder = true
                return
            }
            this.setParcelRegions(list)
            this.parcelRegionPlaceholder = false
        },

        // 数据接入接口。每个地区的定位方式二选一：
        //   {id, name, center:[lon,lat], zoom}
        //   {id, name, extent:[minx,miny,maxx,maxy]}
        // 第二参数可选，用来指定“全部”要回到的视图：{center:[lon,lat], zoom}
        setParcelRegions:function(list, allView){
            this.parcelRegions = Array.isArray(list) ? list.slice() : []
            if(allView !== undefined) this.parcelRegionAllView = allView
            this.parcelRegionId = PARCEL_REGION_ALL_ID
        },

        // 选中某个地区：地图自动切过去；“全部”回到完整视图
        selectParcelRegion:function(id){
            if(!this.map || !this.map.getView) return
            // 已经框选过就先撤掉遮罩，否则地图挪走后整个画面都被遮住
            if(this.parcelRoiState !== 'idle') this.clearParcelRoi(false)

            this.parcelRegionId = id || PARCEL_REGION_ALL_ID
            const view = this.map.getView()

            if(this.parcelRegionId === PARCEL_REGION_ALL_ID){
                const home = this.parcelRegionAllView || PARCEL_DEFAULT_VIEW
                view.animate({center: home.center, zoom: home.zoom, duration: 600})
                return
            }

            const region = this.parcelRegions.find(item => item && item.id === this.parcelRegionId)
            if(!region) return
            if(Array.isArray(region.extent) && region.extent.length === 4){
                view.fit(region.extent, {
                    padding: [PARCEL_REGION_PADDING, PARCEL_REGION_PADDING, PARCEL_REGION_PADDING, PARCEL_REGION_PADDING],
                    duration: 600
                })
            }else if(Array.isArray(region.center) && region.center.length === 2){
                view.animate({
                    center: region.center,
                    zoom: typeof region.zoom === 'number' ? region.zoom : view.getZoom(),
                    duration: 600
                })
            }
        },

        removeCropLayer:function(){
            if(!this.map || !this.map.removeLayer) return
            this.map.removeLayer(this.cropLayer)
        },
        removeAdministrativeLayer:function(){
            if(!this.map || !this.map.removeLayer) return
            this.map.removeLayer(this.administrativeLayer)
        },
        removeCropImageryLayers:function(){
            if(!this.map || !this.map.removeLayer) return
            this.cropImageryLayers.forEach(layer=>{
                if(Object.keys(layer).length !== 0){
                    console.log(true)
                    this.map.removeLayer(layer);
                }
            })
        },
        removeClick:function (){
            if(!this.clickChoose || Object.getOwnPropertyNames(this.clickChoose).length===0) return
            unByKey(this.clickChoose)
        },
        removeTimeData:function(){
            if(!this.map || !this.map.removeLayer) return
            this.map.removeLayer(this.timeLayer)
        },


    

        // 流域底图（ArcGIS底图）
        // param：{type:arcgis底图类型}
        addBasinBasicLayer:function(type='NatGeo_World_Map'){
            const URL = `https://server.arcgisonline.com/ArcGIS/rest/services/${type}/MapServer/tile/{z}/{y}/{x}`
            const basinBasicLayer = new Tile({
                source:new XYZ({
                    url: URL,
                    crossOrigin: "anonymous"
                })
            })

            this.basinBasicLayer = basinBasicLayer
            this.map.addLayer(this.basinBasicLayer)
        },


        // 移除流域底图
        removeBasinLayer:function(){
            if(this.map && this.map.removeLayer && Object.getOwnPropertyNames(this.basinBasicLayer).length!==1){
                this.map.removeLayer(this.basinBasicLayer)
                this.basinBasicLayer = new Layer({})
            }
            // 移除流域所有图层
            try{
                if(this.basinBoundaryLayer && this.map && this.map.removeLayer){
                    this.map.removeLayer(this.basinBoundaryLayer)
                    this.basinBoundaryLayer = new Layer({})
                }
            }catch(e){}
            try{
                if(this.basinMaskLayer && this.map && this.map.removeLayer){
                    this.map.removeLayer(this.basinMaskLayer)
                    this.basinMaskLayer = new Layer({})
                }
            }catch(e){}
            try{
                if(this.basinLabelLayer && this.map && this.map.removeLayer){
                    this.map.removeLayer(this.basinLabelLayer)
                    this.basinLabelLayer = new Layer({})
                }
            }catch(e){}
        },

        // 添加流域边界图层
        addBasinBoundaryLayer:function(){
            console.log("add BasinLayer!!")
            this.basinBoundaryUrl = `${this.baseUrl}/geoserver/agri-agent/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=agri-agent:bh-basin-shp&outputFormat=application/json`

            const basinSource = new VectorSource({
                url: this.basinBoundaryUrl,
                format: new GeoJSON(),
            });

            // boundary stroke (will be placed above the mask)
            const basinBoundaryLayer = new VectorLayer({
                source: basinSource,
                zIndex: 4,
                style: new Style({
                    stroke: new Stroke({
                        color: 'rgba(255,0,0,0.5)',
                        width: 3
                    }),
                })
            });

            // 流域内部高亮遮罩
            const maskSource = new VectorSource();
            const maskLayer = new VectorLayer({
                source: maskSource,
                zIndex: 3,
                style: new Style({
                    fill: new Fill({ color: 'rgba(0,0,0,0.6)' }),
                    stroke: null
                })
            });

            // 添加遮罩
            const buildMask = () => {
                const features = basinSource.getFeatures();
                if(!features || features.length === 0) return;

                // world ring in lon/lat then transformed to map projection
                const viewProj = this.map.getView().getProjection();
                const worldRingLonLat = [
                    [-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]
                ];
                const worldRing = worldRingLonLat.map(c => fromLonLat(c, viewProj));

                const holes = [];
                features.forEach(f => {
                    const geom = f.getGeometry();
                    if(!geom) return;
                    const type = geom.getType();
                    if(type === 'Polygon'){
                        const rings = geom.getCoordinates();
                        rings.forEach(r => holes.push(r));
                    } else if(type === 'MultiPolygon'){
                        const polys = geom.getCoordinates();
                        polys.forEach(poly => {
                            poly.forEach(r => holes.push(r));
                        })
                    }
                });

                const maskCoords = [worldRing].concat(holes);
                const maskFeature = new Feature(new Polygon(maskCoords));
                maskSource.clear();
                maskSource.addFeature(maskFeature);
            };

            basinSource.on('change', () => {
                // wait until features are loaded into the source
                if(basinSource.getState && basinSource.getState() === 'ready'){
                    buildMask();
                } else if(basinSource.getFeatures().length>0){
                    buildMask();
                }
            });

            this.basinBoundaryLayer = basinBoundaryLayer;
            this.basinMaskLayer = maskLayer;
            this.map.addLayer(this.basinMaskLayer);
            this.map.addLayer(this.basinBoundaryLayer);
        },


        // 添加流域标签（自定义geojson）
        // 添加流域标签（自定义geojson）
addBasinLabelLayer: function() {
    const labelSource = new VectorSource({
        url: '/data/balkhash-labels.geojson', 
        format: new GeoJSON(),
    });

    const labelLayer = new VectorLayer({
        source: labelSource,
        // 修改点 1：将 style 函数改为箭头函数 (以保留 this 指向)，并接收 resolution 参数
        style: (feature, resolution) => {
            const name = feature.get('name:zh') || feature.get('name');

            if (!name) return null;

            // 修改点 2：通过 resolution 获取当前的缩放级别 (zoom)
            // 注意：确保 this.map 已经被正确初始化并且可以访问
            let zoom = this.map.getView().getZoomForResolution(resolution);
            
            // 修改点 3：根据缩放级别计算动态字体大小 (单位：px)
            // 基础算法示例：zoom 变大（地图放大）时，字体也适度变大
            // 你可以根据实际的初始视角（如 zoom=5）和视觉需求调整这里的基数和乘数
            let fontSize = 12 + (zoom - 5) * 1.5; 

            // 修改点 4：限制字体大小的上下限，避免缩放过度导致字体看不清或占满全屏
            // 这里限制最小 12px，最大 26px
            fontSize = Math.max(10, Math.min(fontSize, 26)); 

            // 可选：当地图缩放到很小（视角很高）时，直接隐藏标签以防止密密麻麻
            // if (zoom < 4) return null;

            return new Style({
                text: new Text({
                    text: name,
                    // 修改点 5：使用模板字符串将动态计算的字体大小应用到 font 属性中
                    font: `bold ${fontSize}px "FangSong", serif`,
                    fill: new Fill({
                        color: '#000000'
                    }),
                    stroke: new Stroke({
                        color: '#FFFFFF',
                        width: 1.5
                    }),
                    offsetY: -15 // 向上偏移 15 像素
                })
            });
        },
        zIndex: 99
    });
    
    this.basinLabelLayer = labelLayer;
    this.map.addLayer(this.basinLabelLayer);
    
    return labelLayer;
},

        // 添加流域标签（天地图）
        addBasinLabelLayer1: function() {
            const tk = "37680d3f8085db6effbc0c031cca6106"; 
            const URL = `http://t{0-7}.tianditu.gov.cn/cta_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cta&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`;

            const labelLayer = new Tile({
                source: new XYZ({
                    url: URL,
                    crossOrigin: 'anonymous' // 解决跨域导致 Canvas 污染的问题
                }),
                zIndex: 99, // 设置一个较高的 zIndex，确保注记文字盖在底层地图之上
                extent: BALKHASH_EXTENT
            });

            this.basinLabelLayer = labelLayer;
            this.map.addLayer(this.basinLabelLayer);
        },

        // 添加流域标签 arcgis
        addBasinLabelLayer2: function() {
            const labelUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}`;

            const labelLayer = new Tile({
                source: new XYZ({
                    url: labelUrl,
                    crossOrigin: 'anonymous'
                }),
                zIndex: 99, // 确保注记在最上层
                name: 'BasinLabel',
                extent: BALKHASH_EXTENT
            });

            this.basinLabelLayer = labelLayer;
            this.map.addLayer(this.basinLabelLayer);
        },

        // 添加流域标签 OSM
        addBasinLabelLayer3: function() {
            // 使用 osm-cn 中文瓦片服务（由 OSM 中国社区维护）
            // 注意：此服务中文覆盖集中在中国境内，海外区域可能退化为英文
            const labelUrl = `https://tile.openstreetmap.org/{z}/{x}/{y}.png`;

            // 更推荐使用支持中文的 CartoDb Voyager（中文地名优先渲染）
            const cartoLabelUrl = `https://{a-c}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png`;

            const labelLayer = new Tile({
                source: new XYZ({
                    url: cartoLabelUrl,
                    crossOrigin: 'anonymous',
                    // 通过 Accept-Language 头提示服务器优先返回中文（部分服务支持）
                    tileLoadFunction: function(tile, src) {
                        const xhr = new XMLHttpRequest();
                        xhr.open('GET', src);
                        xhr.setRequestHeader('Accept-Language', 'zh-CN,zh;q=0.9');
                        xhr.responseType = 'blob';
                        xhr.onload = function() {
                            const objectUrl = URL.createObjectURL(xhr.response);
                            tile.getImage().src = objectUrl;
                        };
                        xhr.send();
                    }
                }),
                zIndex: 99,
                name: 'BasinLabel'
            });

            this.basinLabelLayer = labelLayer;
            this.map.addLayer(this.basinLabelLayer);
        },

        // 添加流域标签 Google
        addBasinLabelLayer4: function() {
            // 谷歌纯标签与路网透明层，强制中文
            const googleLabelUrl = 'https://mt0.google.com/vt/lyrs=h&hl=zh-CN&gl=CN&x={x}&y={y}&z={z}';

            const labelLayer = new TileLayer({
                source: new XYZ({
                    url: googleLabelUrl,
                    crossOrigin: 'anonymous'
                }),
                zIndex: 99, 
                // 关键折中策略：设置半透明。
                // 这会让不需要的城市和公路“融入”底图，不喧宾夺主，同时保留基本的中文地理参考。
                opacity: 0.6, 
                name: 'BasinLabel_Chinese_Google'
            });

            this.basinLabelLayer = labelLayer;
            this.map.addLayer(this.basinLabelLayer);
        },


        addLandMap:function(){
            const landSource = new TileWMS({
                url:`${this.baseUrl}/geoserver/test/wms`,
                params:{
                    LAYERS:'test:feichen',
                    VERSION:'1.1.1',
                    TILED:true
                },
                projection:'EPSG:4326',
                serverType:'geoserver'
            })

            const landLayer = new Tile({
                source:landSource
            })
            this.clearMap(0)
            this.landLayer = landLayer
            this.map.addLayer(this.landLayer)
        },
        // 添加颜色图层
        addColorLayer:function({fillColor,opacity,strokeColor,strokeWidth}) {
            const colorSource = new TileWMS({
                url:`${this.baseUrl}/geoserver/test/wms`,
                params:{
                    LAYERS:'test:feichen_RetGEO',
                    VERSION:'1.1.1',
                    TILED:true,
                    STYLES:'041493',
                    env:`fillColor:${fillColor};opacity:${opacity};strokeColor:${strokeColor};strokeWidth:${strokeWidth}`
                },
                projection:'EPSG:4326',
                serverType:'geoserver'
            })
            const colorLayer = new Tile({
                source:colorSource,
            })
            this.clearMap(1)
            this.colorLayer = colorLayer
            this.map.addLayer(this.colorLayer)
        },
        addHuanTaiLand:function(){
            const huanTaiLandSource = new TileWMS({
                url:`${this.baseUrl}/geoserver/test/wms`,
                params:{
                    LAYERS:'test:huantai_landmass',
                    VERSION:'1.1.1',
                    TILED:true,
                    STYLES:'resetChannel'
                },
                projection:'EPSG:4326',
                serverType:'geoserver'
            })

            const huanTaiLandLayer = new Tile({
                source:huanTaiLandSource
            })
            this.clearMap(0)
            this.huanTaiLandLayer = huanTaiLandLayer
            this.map.addLayer(this.huanTaiLandLayer)
        },
        addHuanTaiColor:function(index){
            let styleSheet= ['huantai_landmass_green_style','huantai_landmass_colorful_style']
            const huanTaiColorSource = new TileWMS({
                url:`${this.baseUrl}/geoserver/test/wms`,
                params:{
                    LAYERS:'test:huantai_shape',
                    VERSION:'1.1.1',
                    TILED:true,
                    STYLES:styleSheet[index]
                },
                projection:'EPSG:4326',
                serverType:'geoserver'
            })

            const huanTaiColorLayer = new Tile({
                source:huanTaiColorSource
            })
            this.clearMap(3)
            this.huanTaiColorLayer = huanTaiColorLayer
            this.map.addLayer(this.huanTaiColorLayer)
        },





        //移除图层的函数
        clearMap:function(i){
            // 如果 map 未初始化，直接返回，避免对不可用的数据源或未挂载的 map 进行操作
            if(!this.map || !this.map.removeLayer) return

            if(Object.getOwnPropertyNames(this.basicLayer).length!==1){
                // this.map.removeLayer(this.basicLayer)
                // this.basicLayer={}
            }
            if(Object.getOwnPropertyNames(this.timeLayer).length!==1){
                this.map.removeLayer(this.timeLayer)
                this.timeLayer={}
            }
            if(Object.getOwnPropertyNames(this.landLayer).length!==1&&i!==1){
                this.map.removeLayer(this.landLayer)
                this.landLayer={}
            }
            if(Object.getOwnPropertyNames(this.colorLayer).length!==1){
                this.map.removeLayer(this.colorLayer)
                this.colorLayer={}
            }
            if(Object.getOwnPropertyNames(this.cropLayer).length!==1){
                this.map.removeLayer(this.cropLayer)
                this.cropLayer={}
            }
            if(Object.getOwnPropertyNames(this.cropLandLayer).length!==1&&i!==2){
                this.map.removeLayer(this.cropLandLayer)
                this.cropLandLayer={}
            }
            if(Object.getOwnPropertyNames(this.huanTaiColorLayer).length!==1){
                this.map.removeLayer(this.huanTaiColorLayer)
                this.huanTaiColorLayer={}
            }
            if(Object.getOwnPropertyNames(this.huanTaiLandLayer).length!==1&&i!==3){
                this.map.removeLayer(this.huanTaiLandLayer)
                this.huanTaiLandLayer={}
            }
            
            // 移除流域底图、边界等
            this.removeBasinLayer();
            // 移除农田图层
            this.removeAgriParcelLayer();
            // 移除地块边界与交点叠加
            this.removeParcelBoundaryOverlay();
            // 移除日期时间轴的图层并停止播放
            this.stopParcelTimelinePlay();
            this.removeParcelTimelineLayer();
            // 取消框选截取
            this.clearParcelRoi();
        },

        addFeatureLayer:function(list){
            // console.log(list)
            console.log("获得信息",list)
        },


        changeHuanTaiColor:function(index){
            if(index===0){
                this.addHuanTaiColor(0)
            }else if(index===1){
                this.addHuanTaiColor(1)
            }
        },

        // 初始化地图
        initMap:function(){
            console.log("init map!!")
            const map = new OlMap({
                target: 'mapView',
                view: new View({
                    center: [(72 + 82) / 2, (42 + 50) / 2],
                    zoom: 6.5,
                    projection: "EPSG:4326",
                }),
            })
            this.map = markRaw(map)
            
        },
        compare:function(map){
            console.log(map===this.map)
        },
    },

    getters:{

    }
})
export default useMapStore
