"use strict";

// three.js with webgpu backend:
// "three": "https://cdn.jsdelivr.net/npm/three@0.175.0/build/three.webgpu.min.js",
// three.js with Webgl backend:
// "three": "https://cdn.jsdelivr.net/npm/three@0.175.0/build/three.module.min.js",

// import some stuff, then make it available in the html code

import { PlateNavigator, makeWellName, matWellColor, matSiteColor, matFovColor } from "platenavigator";
// these colors are used to create a legend in html
Object.assign(window, { matWellColor, matSiteColor, matFovColor });

import { registerNumberInput } from "numberinput";
Object.assign(window, { registerNumberInput });

import { ChannelImageView } from "channelview";

import { tooltipConfig, enabletooltip } from "tooltip";
Object.assign(window, { enabletooltip });

import { initTabs } from "tabs";
Object.assign(window, { initTabs });

import { makeHistogram,histogramLayout,histogramConfig } from "histogram";

/**
 * add 'disabled' attribute to an element if condition is true, otherwise removes the attribute.
 * @param {HTMLElement} el
 * @param {function():boolean} condition
 * */
function disableElement(el, condition) {
    if (condition()) {
        el.setAttribute("disabled", "true")
    } else {
        el.removeAttribute("disabled")
    }
}
Object.assign(window, {disableElement})

// import alpine, and start
import { Alpine } from "alpine";
window.addEventListener("load", () => {
    Alpine.start();
});

/**
 * clone an object.
 * 
 * attempts structuredClone first, with fallback to json round trip.
 * @template T
 * @param {T} o 
 * @returns {T}
 */
function cloneObject(o){
    try{
        return structuredClone(o);
    }catch(e){
        return JSON.parse(JSON.stringify(o));
    }
}

/**
 * @template T
 * @template {object} E
 * @type {CheckMapSquidRequestFn<T,E>}
 */
async function checkMapSquidRequest(v){
    if(!v.ok){
        if(v.status==500){
            /** @type {E} */
            const error_body=await v.json();

            const error=`api/acquisition/start failed with ${v.statusText} ${v.status} because: ${JSON.stringify(error_body)}`;
            console.error(error);
            alert(error);
            throw error;
        }else{
            throw `unknown error: ${v.status} ${await v.blob()}`;
        }
    }
    /** @type {Promise<T>} */
    const ret=await v.json();
    
    return ret;
}
Object.assign(window,{checkMapSquidRequest});

document.addEventListener('alpine:init', () => {
    Alpine.data('microscope_state', () => ({
        server_url:"http://127.0.0.1:5002",

        tooltipConfig,

        limits:{
            imaging_exposure_time_ms:{min:0.1,step:0.1,max:936},
            imaging_analog_gain_db:{min:0,step:0.1,max:24},
            imaging_focus_offset_um:{min:-200,step:0.1,max:200},
            imaging_illum_perc:{min:0,step:0.1,max:100},
            imaging_number_z_planes:{min:1,step:2,max:999},
            imaging_delta_z_um:{min:0.1,step:0.1,max:1000},
        },

        themes:["light","dark"],
        theme:"light",
        changeTheme(){
            // apply theme to document body
            const el=document.body;

            // remove existing theme
            const existing_theme_class=Array.from(el.classList).find(c=>c.startsWith('theme-'));
            if(existing_theme_class!==undefined){
                el.classList.remove(existing_theme_class);
            }

            // apply new theme
            el.classList.add(`theme-${this.theme}`);
        },

        /**
         * @returns {Promise<HardwareCapabilities>}
         */
        async getHardwareCapabilities() {
            const plateinfo=await fetch(`${this.server_url}/api/get_features/hardware_capabilities`,{
                method:"POST",
                body:"{}",
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<HardwareCapabilities,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v);
            });

            return plateinfo;
        },
        /**
         * @returns {Promise<MachineDefaults>}
         */
        async getMachineDefaults(){
            const machinedefaults=await fetch(`${this.server_url}/api/get_features/machine_defaults`,{
                method:"POST",
                body:"{}",
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<MachineDefaults,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v);
            });
            console.log("got machine defaults",structuredClone(machinedefaults));

            return machinedefaults;
        },

        /**
         * @returns {Promise<ConfigListResponse>}
         */
        async getConfigList(){
            const configlist=await fetch(`${this.server_url}/api/acquisition/config_list`,{
                method:"POST",
                body:"{}",
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<ConfigListResponse,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v)
            });

            return configlist;
        },

        /**
         * @param {StoreConfigRequest} body
         * @returns {Promise<StoreConfigResponse>}
         */
        async storeConfig(body){
            const response=await fetch(`${this.server_url}/api/acquisition/config_store`,{
                method:"POST",
                body:JSON.stringify(body),
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<StoreConfigResponse,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v);
            });

            return response;
        },

        /**
         * @param {LoadConfigRequest} body
         * @returns {Promise<LoadConfigResponse>}
         */
        async loadConfig(body){
            const response=await fetch(`${this.server_url}/api/acquisition/config_fetch`,{
                method:"POST",
                body:JSON.stringify(body),
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<LoadConfigResponse,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v);
            });

            return response;
        },

        /**
         * get plate types from server
         * @returns {Promise<{plategroups:WellPlateGroup[],allplates:Wellplate[]}>}
         * */
        async getPlateTypes() {
            let data = await this.getHardwareCapabilities();

            /** @type {{plategroups:WellPlateGroup[],allplates:Wellplate[]}} */
            let plateinfo = { allplates: [], plategroups: [] };

            for (const key in data.wellplate_types) {
                const value = data.wellplate_types[key];

                // make copy of plate type
                /** @type {Wellplate} */
                const newplate = structuredClone(value)

                plateinfo.allplates.push(newplate)

                /** @type {WellPlateGroup|undefined} */
                let plategroup = plateinfo.plategroups.find(g => g.numwells == newplate.Num_wells_x*newplate.Num_wells_y)
                if (!plategroup) {
                    plategroup = {
                        label: `${newplate.Num_wells_x*newplate.Num_wells_y} well plate`,
                        numwells: newplate.Num_wells_x*newplate.Num_wells_y,
                        plates: [],
                    }
                    plateinfo.plategroups.push(plategroup)
                }
                plategroup.plates.push(newplate)
            }

            // sort by number of wells, in descending order
            plateinfo.plategroups.sort((g1, g2) => parseInt("" + g1.numwells) - parseInt("" + g2.numwells))

            return plateinfo
        },

        /**
         * @return {Promise<AcquisitionConfig>}
         **/
        async defaultConfig() {
            /** @ts-ignore @type {AcquisitionConfig} */
            let microscope_config = {}

            /** @type {AcquisitionConfig} */
            let referenceConfig = {
                project_name: "",
                plate_name: "",
                cell_line: "",

                autofocus_enabled: false,

                grid: {
                    num_x: 1,
                    delta_x_mm: 0.9,

                    num_y: 1,
                    delta_y_mm: 0.9,

                    num_t: 1,
                    delta_t: {
                        h: 2,
                        m: 1,
                        s: 4,
                    },

                    mask: [{ row: 0, col: 0, selected: true }]
                },

                // some [arbitrary] default
                wellplate_type: {
                    "Manufacturer": "Revvity",
                    "Model_name": "PhenoPlate 384-well",
                    "Model_id_manufacturer": "6057800",
                    "Model_id": "revvity-384-6057800",
                    "Offset_A1_x_mm": 10.5,
                    "Offset_A1_y_mm": 7.36,
                    "Offset_bottom_mm": 0.32799999999999996,
                    "Well_distance_x_mm": 4.5,
                    "Well_distance_y_mm": 4.5,
                    "Well_size_x_mm": 3.26,
                    "Well_size_y_mm": 3.26,
                    "Num_wells_x": 24,
                    "Num_wells_y": 16,
                    "Length_mm": 127.76,
                    "Width_mm": 85.48,
                    "Well_edge_radius_mm": 0.1
                },

                plate_wells: [{ col: 0, row: 0, selected: true }],

                channels: (await this.getHardwareCapabilities()).main_camera_imaging_channels,

                machine_config: await this.getMachineDefaults(),
                comment: "",
                spec_version: {
                    major: 0,
                    minor: 0,
                    patch: 0
                },
                timestamp: null
            }

            Object.assign(microscope_config, referenceConfig)

            return microscope_config
        },

        /** protocols stored on server @type {ConfigListEntry[]} */
        protocol_list:[],
        async refreshConfigList(){
            this.protocol_list=(await this.getConfigList()).configs;
        },

        /** used in GUI to configure filename when storing current config on server */
        configStore_filename:"",
        configStore_overwrite_on_conflict:false,
        async storeCurrentConfig(){
            const configStoreEntry={
                // structuredClone does not work on this
                config_file:this.microscope_config_copy,

                filename:this.configStore_filename,
                comment:this.microscope_config.comment,
                overwrite_on_conflict:this.configStore_overwrite_on_conflict,
            };
            await this.storeConfig(configStoreEntry);

            // ensure no config is overwritten by accident afterwards
            this.configStore_overwrite_on_conflict=false;
            this.configStore_filename="";

            // refresh list after store (to confirm successful store)
            await this.refreshConfigList();
        },

        // keep track of global initialization state
        initDone:false,
        async manualInit(){
            await this.initSelf();
            this.initDone=true;

            await this.refreshConfigList();
        },

        /**
         * 
         * @param {string} name 
         * @returns {MachineConfigItem|null}
         */
        getMachineConfigItem(name){
            for(const configitem of this.microscope_config.machine_config){
                if(configitem.handle==name){
                    return configitem;
                }
            }
            return null;
        },

        /**
         * 
         * @param {MachineConfigItem} config 
         * @returns {Promise<BasicSuccessResponse>}
         */
        async runMachineConfigAction(config){
            if(config.value_kind!="action"){
                throw `cannot runMachineConfigAction on non-action config ${config.handle} (kind=${config.value_kind})`;
            }

            const action_url=`${this.server_url}${config.value}`;
            console.log(`executing action: '${action_url}'`)
            return fetch(action_url, {
                method: "POST",
                body: JSON.stringify({}),
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<BasicSuccessResponse,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v);
            });
        },

        // keep track of number of open websockets (to limit frontend load)
        _numOpenWebsockets:0,
        /**
         * 
         * @param {ChannelInfo} channel_info 
         * @param {number} [downsample_factor=1] 
         * @returns 
         */
        async fetch_image(channel_info,downsample_factor=1){
            const cws = new WebSocket(`${this.server_url}/ws/get_info/acquired_image`);

            this._numOpenWebsockets++;

            const channel_handle=channel_info.channel.handle;

            /**@type {Promise<CachedChannelImage>}*/
            const finished = new Promise((resolve, reject) => {
                // fetch image metadata
                cws.binaryType = "blob";
                cws.onopen = ev => cws.send(channel_handle);
                cws.onmessage = meta_ev => {
                    /**
                     * @type {{
                     * height: number,
                     * width: number,
                     * bit_depth: number,
                     * camera_bit_depth: number
                     * }}
                     */
                    const metadata = JSON.parse(meta_ev.data);

                    // fetch image data (into arraybuffer)
                    cws.binaryType = "arraybuffer";
                    cws.onmessage = img_ev => {
                        /** @type {ArrayBuffer} */
                        const img_data = img_ev.data;

                        /** @type {CachedChannelImage} */
                        const img = Object.assign(metadata, {
                            // store image data
                            data: img_data,
                            // update current channel info (latest image, incl. metadata)
                            info: channel_info,
                        });

                        // close websocket once data is received
                        cws.close();
                        this._numOpenWebsockets--;

                        resolve(img);
                    }
                    // send downsample factor
                    cws.send(`${downsample_factor}`);
                }
                cws.onerror = ev => reject(ev);
            });
            const data = await finished;
            console.log(data.info.channel.name, data);
            return data;
        },
        /**
         * 
         * @param {MicroscopeState} data 
         */
        async updateMicroscopeStatus(data){
            const timestamps = []

            for (let channelhandle of Object.keys(data.latest_imgs)) {
                const channel = data.latest_imgs[channelhandle]
                timestamps.push(channel.timestamp)
            }
            // console.log(`updateMicroscopeStatus with`, timestamps)
            // update state with data from 'data' object
            this.state=data;

            if (this._numOpenWebsockets < 1 && this.state.latest_imgs != null) {
                for (const [channel_handle, channel_info] of Object.entries(this.state.latest_imgs)) {
                    // ignore laser autofocus image (which is not actually useful for anything other than debugging, for which it has its own button)
                    if(channel_handle=="laser_autofocus")continue;

                    const cached_image = this.cached_channel_image.get(channel_handle)

                    const image_cache_outdated = /*no image in cache*/ (cached_image == null)
                        || /* cached image older than latest image */ (channel_info.timestamp > cached_image.info.timestamp)

                    //console.log(`${channel_handle} image_cache_outdated? ${image_cache_outdated} (${channel_info.timestamp} ${cached_image?.info.timestamp})`)
                    if (!image_cache_outdated) {
                        continue
                    }

                    const img=await this.fetch_image(channel_info,2);
                    this.cached_channel_image.set(channel_handle, img);
                }
            }

            if (this.plateNavigator && this.plateNavigator.objectiveFov && this.state.adapter_state != null) {
                this.plateNavigator.objectiveFov.position.x = this.state.adapter_state.stage_position.x_pos_mm - this.plateNavigator.objective.fovx / 2
                this.plateNavigator.objectiveFov.position.y = this.state.adapter_state.stage_position.y_pos_mm - this.plateNavigator.objective.fovy / 2
            }
        },

        /** @type {PlateNavigator|null} */
        plateNavigator: null,
        /**
         * 
         * @param {HTMLElement} el 
         */
        initPlateNavigator(el){
            this.plateNavigator=new PlateNavigator(el);

            this.plateNavigator.cameraFit({
                ax:0,
                ay:0,
                bx:this.microscope_config.wellplate_type.Length_mm,
                by:this.microscope_config.wellplate_type.Width_mm,
            })
        },

        /**
         * 
         * @param {AcquisitionConfig} microscope_config 
         * @param {Wellplate} plate 
         */
        async setPlate(microscope_config, plate) {
            if(!this.plateNavigator)return;
            await this.plateNavigator.loadPlate(microscope_config, plate);
        },

        /** @type {MicroscopeState|null} */
        _state: null,
        /** @returns {MicroscopeState} */
        get state(){
            if(!this._state){ throw `bug in state`; }
            return this._state;
        },
        /**
         * @param {MicroscopeState} newstate
         */
        set state(newstate){
            if(!this._state){
                /** @ts-ignore */
                this._state={};
            }
            /** @ts-ignore */
            Object.assign(this._state,newstate);
        },
        /** @type {{plategroups: WellPlateGroup[],allplates: Wellplate[]}|null}  */
        _plateinfo: null,
        get plateinfo(){
            if(!this._plateinfo){ throw `bug in plateinfo`; }
            return this._plateinfo;
        },
        /** @type {AcquisitionConfig|null} */
        _microscope_config: null,
        get microscope_config(){
            if(!this._microscope_config){ throw `bug in microscope_config`; }
            return this._microscope_config;
        },

        /** a copy of this is required often, but non-trivial to construct, so the utility is provided here. */
        get microscope_config_copy(){
            return cloneObject(this.microscope_config);
        },

        /** used to filter the machine config list */
        machineConfigHandleFilter:"",

        /** indicate of connection to server is currently established */
        isConnectedToServer:false,

        // initiate async websocket event loop to update
        /** @type {WebSocket|null} */
        status_ws: null,
        server_url_input:"",
        /**
         * 
         * @param {string?} url
         * @returns 
         */
        status_reconnect(url){
            // if new url is same one, and a connection is already [in process of] being established
            // skip reconnect attempt.
            if(url==this.server_url && this.status_ws!=null){
                return;
            }

            // if no url has been provided, reconnect to existing url.
            // if one has been provided, update current url and proceed.
            if(url){
                this.server_url=url;
            }

            // reconnection is only attempted if connection is not currently established
            this.isConnectedToServer=false;

            try{
                // ensure old websocket handle is closed
                if (this.status_ws != null && this.status_ws.readyState != WebSocket.CLOSED) {
                    this.isConnectedToServer=false;

                    this.status_ws.close();
                }

                // try reconnecting (may fail if server is closed, in which case just try reconnecting later)
                this.status_ws = new WebSocket(`${this.server_url}/ws/get_info/current_state`);
                this.status_ws.onmessage = async ev => {
                    const data = JSON.parse(JSON.parse(ev.data));
                    await this.updateMicroscopeStatus(data);
                    
                    // if we got this far, the connection to the server is established
                    this.isConnectedToServer=true;

                    requestAnimationFrame(()=>this.status_getstate_loop());
                };
                this.status_ws.onerror = ev => {
                    this.isConnectedToServer=false;

                    // wait a short time before attempting to reconnect
                    setTimeout(this.status_reconnect, 200);
                };
                this.status_ws.onopen = ev => requestAnimationFrame(()=>this.status_getstate_loop());
            }catch(e){
                this.isConnectedToServer=false;

                console.warn(`websocket error: ${e}`);
                setTimeout(this.status_reconnect, 200);
            }
        },

        status_getstate_loop(){
            try {
                if (!this.status_ws || this.status_ws.readyState == WebSocket.CLOSED) {
                    // trigger catch clause which will reconnect
                    throw "websocket is closed!";
                } else if (this.status_ws.readyState == WebSocket.OPEN) {
                    // send arbitrary message to receive status update
                    this.status_ws.send("info");
                } else {
                    // console.log(ws.ws.readyState, WebSocket.CLOSED, WebSocket.CONNECTING, WebSocket.OPEN)
                    // if websocket is not yet ready, try again later
                    requestAnimationFrame(this.status_getstate_loop);
                }
            } catch (e) {
                this.isConnectedToServer=false;

                // wait a short time before attempting to reconnect
                setTimeout(this.status_reconnect, 200);
            }
        },

        // this is an annoying workaround (in combination with initManual) because
        // alpine does not actually await an async init before mounting the element.
        // which leads to a whole bunch of errors in the console and breaks
        // some functionalities that depend on fields being initialized on mounting.
        async initSelf() {
            this._plateinfo=await this.getPlateTypes();
            this._microscope_config=await this.defaultConfig();

            // init data
            const currentStateData = await fetch(`${this.server_url}/api/get_info/current_state`, {
                method: "POST",
                body: "{}"
            });
            if (!currentStateData.ok) throw `error in fetch. http status: ${currentStateData.status}`;
            const currentStateJson = await currentStateData.json();
            await this.updateMicroscopeStatus(currentStateJson);

            this.status_getstate_loop();
        },

        /**
         * 
         * @param {HTMLCanvasElement} el
         * @returns {Promise<void>}
         */
        async initChannelView(el) {
            this.view = new ChannelImageView(el, this.cached_channel_image)
        },
        /** @type {ChannelImageView|null} */
        view: null,
        /** @type {number} */
        channelViewNumCols:3,

        /**
         * call this to update the display for a channel
         * @param {HTMLElement} channelElement must be a valid channel display (with class channel-box-image)
         */
        updateChannelCache(channelElement) {
            const channelhandle = channelElement.parentElement?.getAttribute("channelhandle")
            console.log(`updating ${channelhandle}`)
            if (!channelhandle) { const error = `element is not a valid channel-box-image`; console.error(error); throw error }
            const cachedImage = this.cached_channel_image.get(channelhandle)
            if (!cachedImage) return null;

            const channelView = this.view?.sceneInfos.find(s => s.elem == channelElement);
            if (!channelView) return null;

            if (!this.view) return null;
            this.view.updateTextureData(channelView, cachedImage)
        },

        /** get total number of images acquired with current config */
        get num_images() {
            const num_sites_xy = this.microscope_config.grid.mask.reduce((o, n) => o + (n.selected ? 1 : 0), 0)
            const num_sites_xyt = num_sites_xy * this.microscope_config.grid.num_t
            const num_wells = this.microscope_config.plate_wells.reduce((o, n) => o + (n.selected ? 1 : 0), 0)
            const num_channels = this.microscope_config.channels.reduce((o, n) => o + (n.enabled ? (1 * n.num_z_planes) : 0), 0)

            const total_num_images = num_sites_xyt * num_wells * num_channels

            return total_num_images
        },

        /**
         * to keep track of interactive well selection with the mouse cursor
         * @type {AcquisitionWellSiteConfigurationSiteSelectionItem?}
         */
        start_selected_well: null,

        /** @type {Map<string,CachedChannelImage>} */
        cached_channel_image: new Map(),

        makeHistogram,
        /**
         * 
         * @param {HTMLElement} el 
         */
        updateHistogram(el){
            /** @type {PlotlyTrace[]} */
            const data=[];
            const xvalues=new Uint16Array(257).map((v,i)=>i);

            for(const [key,value] of Array.from(this.cached_channel_image.entries()).toSorted((l,r)=>{
                return (l[0]>r[0])?1:-1;
            })){
                // key is handle, i.e. key===value.info.channel.handle (which is not terribly useful for displaying)
                const name=value.info.channel.name;

                // skip channels that are not enabled
                if(! (this.microscope_config.channels.find(c=>c.handle==key)?.enabled??false)){
                    continue;
                }

                const y=new Float32Array(xvalues.length);

                const rawdata=(()=>{
                    switch(value.bit_depth){
                        case 8: return new Uint8Array(value.data);
                        case 16: return new Uint16Array(value.data).map(v=>v>>8);
                        default:throw``;
                    }
                })();
                for(const val of rawdata){
                    y[val]++;
                }
                data.push({
                    name,
                    // @ts-ignore
                    x:xvalues,
                    // @ts-ignore
                    y
                });
            }
            Plotly.react(el,data,histogramLayout,histogramConfig);
        },

        /**
         * scroll target channel view panel into view
         * @param {string} handle 
         */
        channel_makeVisible(handle){
            const el=document.getElementById(`channel-display-${handle}`);
            // element may not be visible, e.g. because the tab is not currently visible
            if(!el)return;
            el.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
                inline: 'nearest',
            });
        },

        /**
         * set status of all wells in selection to inverse of current status of first selected element
         * @param {AcquisitionWellSiteConfigurationSiteSelectionItem?} from
         * @param {AcquisitionWellSiteConfigurationSiteSelectionItem?} to
         */
        async toggleWellSelectionRange(from, to) {
            if (!from || !to) {
                this.start_selected_well = null
                return
            }

            const target_status = !from.selected

            const lower_row = Math.min(from.row, to.row)
            const higher_row = Math.max(from.row, to.row)
            const lower_col = Math.min(from.col, to.col)
            const higher_col = Math.max(from.col, to.col)

            this.microscope_config.plate_wells.forEach(well => {
                if (well.row < 0) return
                if (well.col < 0) return

                if (well.row >= lower_row && well.row <= higher_row) {
                    if (well.col >= lower_col && well.col <= higher_col) {
                        well.selected = target_status
                    }
                }
            });
            await this.updatePlate(undefined, undefined)
        },

        /** @type {string|null} */
        current_acquisition_id:null,
        /**
         * rpc to api/acquisition/start
         * 
         * internally clones the body. 
         * @param {AcquisitionStartRequest} body 
         * @returns  {Promise<AcquisitionStartResponse>}
         */
        async acquisition_start(body){
            // make deep copy first
            /** @type {AcquisitionStartRequest} */
            const body_copy=cloneObject(body);

            // mutate copy (to fix some errors we introduce in the interface)
            // 1) remove wells that are unselected or invalid
            body_copy.config_file.plate_wells=body_copy.config_file.plate_wells.filter(w=>w.selected&&w.col>=0&&w.row>=0);

            const body_str=JSON.stringify(body_copy,null,2);

            // console.log("acquisition start body:",body_str);
            return fetch(`${this.server_url}/api/acquisition/start`, {
                method: "POST",
                body: body_str,
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<AcquisitionStartResponse,AcquisitionStartError>} */
                const check=checkMapSquidRequest;
                return check(v)
            }).then(v=>{
                this.current_acquisition_id=v.acquisition_id;
                return v;
            });
        },
        /**
         * rpc to api/acquisition/cancel
         * @param {AcquisitionStopRequest} body 
         * @returns {Promise<AcquisitionStopResponse>}
         */
        async acquisition_stop(body){
            try{
                return fetch(`${this.server_url}/api/acquisition/cancel`, {
                    method: "POST",
                    body: JSON.stringify(body),
                    headers: [
                        ["Content-Type", "application/json"]
                    ]
                }).then(v=>{
                    /** @ts-ignore @type {CheckMapSquidRequestFn<AcquisitionStopResponse,AcquisitionStopError>} */
                    const check=checkMapSquidRequest;
                    return check(v);
                });
            }catch(e){
                const error=`api/acquisition/cancel failed because ${e}`;
                console.error(error);
                throw error;
            }
        },
        /** @type {AcquisitionStatusOut?} */
        latest_acquisition_status:null,
        /**
         * rpc to /api/acquisition/status
         * @param {AcquisitionStatusRequest} body
         * @returns {Promise<AcquisitionStatusResponse>}
         */
        async acquisition_status(body){
            return fetch(`${this.server_url}/api/acquisition/status`, {
                method: "POST",
                body: JSON.stringify(body),
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<AcquisitionStatusResponse,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v);
            });
        },
            
        get Actions(){
            return {
                /**
                 * rpc to /api/action/move_by
                 * @param {MoveByRequest} body
                 * @returns {Promise<MoveByResult>}
                 */
                moveBy:(body)=>{
                    return fetch(`${this.server_url}/api/action/move_by`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<MoveByResult,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    });
                },

                /**
                 * rpc to /api/action/move_to
                 * @param {MoveToRequest} body
                 * @returns {Promise<MoveToResult>}
                 */
                moveTo:(body)=>{
                    return fetch(`${this.server_url}/api/action/move_to`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<MoveToResult,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    });
                },

                /**
                 * 
                 * @param {MoveToWellRequest} body
                 * @returns {Promise<MoveToWellResponse>}
                 */
                moveToWell:(body)=>{
                    return fetch(`${this.server_url}/api/action/move_to_well`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<MoveToWellResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    });
                },

                /**
                 * 
                 * @param {ChannelSnapshotRequest} body 
                 * @returns {Promise<ChannelSnapshotResponse>}
                 */
                snapChannel:(body)=>{
                    return fetch(`${this.server_url}/api/action/snap_channel`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<ChannelSnapshotResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    });
                },

                /**
                 * 
                 * @returns {Promise<EnterLoadingPositionResponse>}
                 */
                enterLoadingPosition:()=>{
                    return fetch(`${this.server_url}/api/action/enter_loading_position`, {
                        method: "POST",
                        body: "{}",
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<EnterLoadingPositionResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    });
                },
                /**
                 * 
                 * @returns {Promise<LeaveLoadingPositionResponse>}
                 */
                leaveLoadingPosition:()=>{
                    return fetch(`${this.server_url}/api/action/leave_loading_position`, {
                        method: "POST",
                        body: "{}",
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<LeaveLoadingPositionResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    });
                },
                /**
                 * @param {StreamBeginRequest} body
                 * @returns {Promise<StreamingStartedResponse>}
                 */
                streamBegin:(body)=>{
                    return fetch(`${this.server_url}/api/action/stream_channel_begin`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<StreamingStartedResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    });
                },
                /**
                 * @param {StreamEndRequest} body
                 * @returns {Promise<StreamEndResponse>}
                 */
                streamEnd:(body)=>{
                    return fetch(`${this.server_url}/api/action/stream_channel_end`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<StreamEndResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    });
                },
                /**
                 * 
                 * @param {LaserAutofocusCalibrateRequest} body 
                 * @returns {Promise<LaserAutofocusCalibrateResponse>}
                 */
                laserAutofocusCalibrate:(body)=>{
                    return fetch(`${this.server_url}/api/action/laser_autofocus_calibrate`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<LaserAutofocusCalibrateResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    }).then(v => {
                        console.log(v);
                        return v;
                    });
                },
                /**
                 * 
                 * @param {LaserAutofocusMoveToTargetOffsetRequest} body 
                 * @returns {Promise<LaserAutofocusMoveToTargetOffsetResponse>}
                 */
                laserAutofocusMoveToTargetOffset:(body)=>{
                    return fetch(`${this.server_url}/api/action/laser_autofocus_move_to_target_offset`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<LaserAutofocusMoveToTargetOffsetResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    }).then(v => {
                        console.log(v);
                        return v;
                    });
                },
                /**
                 * 
                 * @param {LaserAutofocusMeasureDisplacementRequest} body 
                 * @returns {Promise<LaserAutofocusMeasureDisplacementResponse>}
                 */
                laserAutofocusMeasureDisplacement:(body)=>{
                    return fetch(`${this.server_url}/api/action/laser_autofocus_measure_displacement`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<LaserAutofocusMeasureDisplacementResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    }).then(v => {
                        return v;
                    });
                },
                /**
                 * 
                 * @param {LaserAutofocusSnapRequest} body 
                 * @returns {Promise<LaserAutofocusSnapResponse>}
                 */
                laserAutofocusSnap:(body)=>{
                    return fetch(`${this.server_url}/api/action/snap_reflection_autofocus`, {
                        method: "POST",
                        body: JSON.stringify(body),
                        headers: [
                            ["Content-Type", "application/json"]
                        ]
                    }).then(v=>{
                        /** @ts-ignore @type {CheckMapSquidRequestFn<LaserAutofocusSnapResponse,InternalErrorModel>} */
                        const check=checkMapSquidRequest;
                        return check(v);
                    }).then(v => {
                        return v;
                    });
                },
            }
        },

        /** @type {number} */
        laserAutofocusTargetOffsetUM:0,
        async button_laserAutofocusMoveToTargetOffset(){
            const res=await this.Actions.laserAutofocusMoveToTargetOffset({
                config_file:this.microscope_config_copy,
                target_offset_um:this.laserAutofocusTargetOffsetUM,
            });
            return res;
        },
        /**
         * offset and position where it was measured
         * @type {LaserAutofocusMeasureDisplacementResponse|null}
         */
        laserAutofocusMeasuredOffset:null,
        async button_laserAutofocusMeasureOffset(){
            this.laserAutofocusMeasuredOffset=await this.Actions.laserAutofocusMeasureDisplacement({
                config_file:this.microscope_config_copy,
            });
        },

        /**
         * 
         * @param {PlateWellConfig} well 
         * @returns {Promise<void>}
         */
        async buttons_wellcontainer_dblclick(well) {
            if (well.col >= 0 && well.row >= 0) {
                await this.Actions.moveToWell({
                    plate_type: this.microscope_config.wellplate_type,
                    well_name: this.wellName(well) ?? "unknownWellName"
                })
            }
        },
        /**
         * 
         * @returns {Promise<StreamBeginResponse>}
         */
        async buttons_startStreaming() {
            const target_channel_handle = this.actionInput.live_acquisition_channelhandle;
            const target_channel = this.microscope_config.channels.find(c => c.handle == target_channel_handle)
            if (!target_channel) { const error = `could not find a channel with handle '${target_channel_handle}'`; console.error(error); throw error }

            /** @type {StreamBeginRequest} */
            const body = {
                framerate_hz: this.actionInput.live_acquisition_framerate,
                channel: target_channel,
            }

            return fetch(`${this.server_url}/api/action/stream_channel_begin`, {
                method: "POST",
                body: JSON.stringify(body),
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<StreamBeginResponse,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v);
            }).then(v => {
                console.log(v);
                return v;
            });
        },
        /**
         * 
         * @returns {Promise<StreamEndResponse>}
         */
        async buttons_endStreaming() {
            const target_channel_handle = this.actionInput.live_acquisition_channelhandle;
            const target_channel = this.microscope_config.channels.find(c => c.handle == target_channel_handle)
            if (!target_channel) { const error = `could not find a channel with handle '${target_channel_handle}'`; console.error(error); throw error }

            /** @type {StreamEndRequest} */
            const body = {
                channel: target_channel,
            }

            return fetch(`${this.server_url}/api/action/stream_channel_end`, {
                method: "POST",
                body: JSON.stringify(body),
                headers: [
                    ["Content-Type", "application/json"]
                ]
            }).then(v=>{
                /** @ts-ignore @type {CheckMapSquidRequestFn<StreamEndResponse,InternalErrorModel>} */
                const check=checkMapSquidRequest;
                return check(v);
            }).then(v => {
                console.log(v)
                return v
            })
        },
        /**
         * set this as onchange callback on the select element that controls the streaming channel
         * @param {HTMLSelectElement} element 
         */
        callback_setStreamingChannel(element) {
            this.actionInput.live_acquisition_channelhandle = element.value;
        },

        /*
        input values that are used by some requests sent to the server, hence
        should be stored here to avoid dom interactions outside alpine
        */
        actionInput: {
            move_by_x_mm: 1,
            move_by_y_mm: 1,
            move_by_z_um: 1,

            live_acquisition_channelhandle: "",
            live_acquisition_framerate: 5.0,
        },

        get laserAutofocusIsCalibrated(){
            const is_calibrated=(this.getMachineConfigItem("laser_autofocus_is_calibrated")?.value??'no')=='yes';
            return is_calibrated;
        },
        get laserAutofocusReferenceText(){
            const is_calibrated=this.laserAutofocusIsCalibrated;
            const laser_autofocus_calibration_refzmm=this.getMachineConfigItem("laser_autofocus_calibration_refzmm");
            if(
                !is_calibrated || !laser_autofocus_calibration_refzmm
            ){
                return '(none set)';
            }

            if(laser_autofocus_calibration_refzmm.value_kind!="float"){
                throw `machine config laser_autofocus_calibration_refzmm has unexpected value kind ${laser_autofocus_calibration_refzmm.value_kind}`;
            }

            const reference_z_mm=laser_autofocus_calibration_refzmm.value;
            return `set at z = ${reference_z_mm.toFixed(3)}`;
        },
        /**
         * this calibrates the system and sets the current z as reference
         * -> store for later retrieval
         */
        async buttons_calibrateLaserAutofocusHere(){
            const calibration_data=await this.Actions.laserAutofocusCalibrate({});
            console.log(`calibrated laser autofocus system`,calibration_data);

            const calibration_refzmm=this.getMachineConfigItem("laser_autofocus_calibration_refzmm");
            if(!calibration_refzmm)throw`machine config item calibration_refzmm not found during laser autofocus calibration`;
            if(calibration_refzmm.value_kind!="float")throw`machine config item calibration_refzmm has unexpected type ${calibration_refzmm.value_kind}`;
            calibration_refzmm.value=calibration_data.calibration_data.calibration_position.z_pos_mm;

            const calibration_umpx=this.getMachineConfigItem("laser_autofocus_calibration_umpx");
            if(!calibration_umpx)throw`machine config item calibration_umpx not found during laser autofocus calibration`;
            if(calibration_umpx.value_kind!="float")throw`machine config item calibration_umpx has unexpected type ${calibration_umpx.value_kind}`;
            calibration_umpx.value=calibration_data.calibration_data.um_per_px;

            const calibration_x=this.getMachineConfigItem("laser_autofocus_calibration_x");
            if(!calibration_x)throw`machine config item calibration_x not found during laser autofocus calibration`;
            if(calibration_x.value_kind!="float")throw`machine config item calibration_x has unexpected type ${calibration_x.value_kind}`;
            calibration_x.value=calibration_data.calibration_data.x_reference;

            const is_calibrated=this.getMachineConfigItem("laser_autofocus_is_calibrated");
            if(!is_calibrated)throw`machine config item is_calibrated not found during laser autofocus calibration`;
            if(is_calibrated.value_kind!="option")throw`machine config item is_calibrated has unexpected type ${is_calibrated.value_kind}`;
            is_calibrated.value="yes";
        },

        get laserAutofocusOffsetText(){
            const noresult='(not measured)';

            const is_calibrated=this.laserAutofocusIsCalibrated;
            if(!is_calibrated){
                return noresult;
            }
            if(!this.laserAutofocusMeasuredOffset){
                return noresult;
            }
            return this.laserAutofocusMeasuredOffset.displacement_um;
        },

        laserAutofocusDebug_numz:7,
        laserAutofocusDebug_totalz_um:400,
        /** @type {{realz_um:number,measuredz_um:number}[]} */
        laserAutofocusDebug_measurements:[],
        async buttons_laserAutofocusDebugMeasurement(){
            this.laserAutofocusDebug_measurements.length=0;
            if(!this.laserAutofocusIsCalibrated)throw`in buttons_laserAutofocusDebugMeasurement: laser autofocus is not calibrated`;
            
            if(this.laserAutofocusDebug_numz<3)throw`in buttons_laserAutofocusDebugMeasurement: numz (=${this.laserAutofocusDebug_numz}) < 3`;
            const stepDelta_mm=this.laserAutofocusDebug_totalz_um*1e-3/(this.laserAutofocusDebug_numz-1)

            const halfz_mm=this.laserAutofocusDebug_totalz_um*1e-3/2;

            // 1) approach ref z
            /** @ts-ignore @type {number} */
            const refz_mm=this.getMachineConfigItem("laser_autofocus_calibration_refzmm").value;
            await this.Actions.moveTo({z_mm:refz_mm});

            // 2) move in steps, measure at each
            for(let i=0;i<this.laserAutofocusDebug_numz;i++){
                const current_real_offset_mm=-halfz_mm+i*stepDelta_mm;

                await this.Actions.moveTo({z_mm:refz_mm+current_real_offset_mm});
                try{
                    const res=await this.Actions.laserAutofocusMeasureDisplacement({
                        config_file:this.microscope_config_copy,
                    });
                    this.laserAutofocusDebug_measurements.push({
                        realz_um:current_real_offset_mm*1e3,
                        measuredz_um:res.displacement_um,
                    })
                }catch(e){}
            }
            // 3) restore z (by moving to ref)
            await this.Actions.moveTo({z_mm:refz_mm});

            // 4) flush results
            // nop
        },

        /** @type {HTMLCanvasElement|null} */
        latestLaserAutofocusImageCanvas:null,
        async button_laserAutofocusGetLatestImage(){
            if(!this.latestLaserAutofocusImageCanvas)return;

            const lafSnapRes=await this.Actions.laserAutofocusSnap({
                // @ts-ignore
                exposure_time_ms:this.getMachineConfigItem("laser_autofocus_exposure_time_ms").value,
                // @ts-ignore
                analog_gain:this.getMachineConfigItem("laser_autofocus_analog_gain").value,
            });

            const img=await this.fetch_image({
                channel:{
                    name:"",
                    handle:"laser_autofocus",
                    analog_gain:0,
                    exposure_time_ms:0,
                    illum_perc:0,
                    num_z_planes:0,
                    z_offset_um:0,
                    enabled:true,
                },
                height_px:lafSnapRes.height_px,
                width_px:lafSnapRes.width_px,
                storage_path:"",
                position:{x_pos_mm:0,y_pos_mm:0,z_pos_mm:0,},
                timestamp:0,
            });
            const imgdata=new ImageData(img.width,img.height);
            const rawimgdata=new Uint8ClampedArray(img.data);
            for(let i=0;i<img.width*img.height;i++){
                const px=rawimgdata[i];
                imgdata.data[i*4+0]=px;
                imgdata.data[i*4+1]=px;
                imgdata.data[i*4+2]=px;
                imgdata.data[i*4+3]=255;
            }

            this.latestLaserAutofocusImageCanvas.width = img.width;
            this.latestLaserAutofocusImageCanvas.height = img.height;
            let ctx = this.latestLaserAutofocusImageCanvas.getContext("2d");
            if(!ctx)return;
            ctx.putImageData(imgdata,0,0);
        },

        /**
         * 
         * @returns {{data:PlotlyTrace[],layout:PlotlyLayout,config:PlotlyConfig}}
         */
        _getLaserAutofocusDebugMeasurementPlotData(){
            /** @type {{data:PlotlyTrace[],layout:PlotlyLayout,config:PlotlyConfig}} */
            const ret={
                data:[
                    // measured
                    {
                        x:this.laserAutofocusDebug_measurements.map(m=>m.realz_um),
                        y:this.laserAutofocusDebug_measurements.map(m=>m.measuredz_um),
                        name:"measured",
                        line:{
                            color:"orange",
                        }
                    },
                    // real
                    {
                        x:this.laserAutofocusDebug_measurements.map(m=>m.realz_um),
                        y:this.laserAutofocusDebug_measurements.map(m=>m.realz_um),
                        name:"real",
                        line:{
                            color:"green",
                        }
                    },
                    // error
                    {
                        x:this.laserAutofocusDebug_measurements.map(m=>m.realz_um),
                        y:this.laserAutofocusDebug_measurements.map(m=>m.measuredz_um-m.realz_um),
                        name:"error",
                        line:{
                            color:"red",
                            dash:"dash",
                        }
                    },
                ],
                layout:{
                    autosize: true,
                    showlegend: true,
                    xaxis:{
                        title:{text:"z offset from reference [um]"},
                        range:[
                            // z range, with some margin on either side
                            -10 - this.laserAutofocusDebug_totalz_um / 2,
                             10 + this.laserAutofocusDebug_totalz_um / 2
                        ]
                    },
                    yaxis:{
                        title:{text:"measured offset [um]"}
                    },
                    margin: {
                        t: 20, // top margin for pan/zoom buttons
                        l: 60, // reduced y axis margin
                        r: 20, // reduced x axis margin
                        b: 40, // bottom margin for x-axis title
                    },
                },
                config:{
                    responsive: true,
                    modeBarButtonsToRemove: [
                        'sendDataToCloud',
                        "zoom2d", "pan2d", "select2d", "lasso2d",
                        "zoomIn2d", "zoomOut2d",
                        "autoScale2d", "resetScale2d"
                    ],
                    showLink: false,
                    displaylogo: false,
                }
            };
            return ret;
        },
        /**
         * 
         * @param {HTMLElement} el 
         */
        initLaserAutofocusDebugMeasurementDisplay(el){
            const {data,layout,config}=this._getLaserAutofocusDebugMeasurementPlotData();
            Plotly.newPlot(el,data,layout,config);

            new ResizeObserver(function () {
                // @ts-ignore
                Plotly.relayout(el, { autosize: true });
            }).observe(el)
        },
        /**
         * 
         * @param {HTMLElement} el 
         */
        updateLaserAutofocusDebugMeasurementDisplay(el){
            const {data,layout,config}=this._getLaserAutofocusDebugMeasurementPlotData();
            Plotly.react(el,data,layout,config);
        },

        /**
         * 
         * @param {Wellplate} wellplate 
         * @returns {PlateWellConfig[]}
         */
        createPlateWells(wellplate) {
            /** @type {PlateWellConfig[]} */
            let new_wells = [];
            for (let y = -1; y < wellplate.Num_wells_y; y++) {
                for (let x = -1; x < wellplate.Num_wells_x; x++) {
                    /** @type {PlateWellConfig} */
                    let newwell = { col: x, row: y, selected: false };
                    new_wells.push(newwell);
                }
            }
            return new_wells
        },

        /**
         * well name, i.e. location on the plate (e.g. A01).
         * 
         * headers (e.g. row headers) have no name.
         * @param {PlateWellConfig} well 
         * @returns {string|null}
         */
        wellName(well) {
            const { col: x, row: y } = well;

            const wellisheader = (y < 0) || (x < 0);
            if (wellisheader) {
                return null;
            }
            return makeWellName(x, y);
        },
        /**
         * text in a well in the navigator.
         * 
         * only headers (e.g. row header) have text.
         * @param {PlateWellConfig} well 
         * @returns {string|null}
         */
        wellText(well) {
            const { col: x, row: y } = well;

            if (x < 0 && y < 0) {
                // special case for top left corner of well navigator - no text.

                return null;
            } else if (x < 0) {
                // left-most column: row headers

                return makeWellName(1, y).slice(0, 1);
            } else if (y < 0) {
                // top-most row: column headers
                return makeWellName(x, 1).slice(1);

            } else {
                // not a header -> no text

                return null
            }
        },

        /**
         * 
         * @param {Wellplate} plate 
         * @returns {number}
         */
        plateNumWells(plate) {
            return plate.Num_wells_x * plate.Num_wells_y
        },

        /**
        * if newplate_Model_id is a string: update plate navigator and selector to newly selected plate type
        * if newplate_Model_id is not a string: update plate navigator and selector with changed site or well selections
        * @param {string|any} newplate_Model_id
        * @param {boolean|undefined} force_override
        */
        async updatePlate(newplate_Model_id, force_override) {
            // update plate selector view
            let selectedplate = this.microscope_config.wellplate_type
            if (typeof newplate_Model_id == 'string') {
                const newplate = this.plateinfo.allplates.find(p => p.Model_id == newplate_Model_id);
                if (!newplate) throw new Error(`${newplate_Model_id} not found`);
                const oldplate = this.microscope_config.wellplate_type;

                // update refernce to current plate
                selectedplate = newplate;
                this.microscope_config.wellplate_type = newplate;

                // generate new wells in the dom
                if ((this.plateNumWells(newplate) != this.plateNumWells(oldplate)) || force_override) {
                    const new_wells = this.createPlateWells(newplate);
                    this.microscope_config.plate_wells = new_wells;
                }
            }

            /** @type {AcquisitionWellSiteConfigurationSiteSelectionItem[]} */
            const new_masks = [];
            for (let x = 0; x < this.microscope_config.grid.num_x; x++) {
                for (let y = 0; y < this.microscope_config.grid.num_y; y++) {
                    /** @type {AcquisitionWellSiteConfigurationSiteSelectionItem} */
                    const new_mask = { col: x, row: y, selected: true };
                    new_masks.push(new_mask);
                }
            }
            // insert new elements
            this.microscope_config.grid.mask.splice(
                0, this.microscope_config.grid.mask.length,
                ...new_masks
            );

            // await plate navigator update
            await this.setPlate(
                this.microscope_config,
                selectedplate
            );
        }
    }))
});
