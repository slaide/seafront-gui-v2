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

import { storeConfig, getConfigList, getMachineDefaults, getHardwareCapabilities, getPlateTypes, defaultConfig } from "microscope_setup";

import { ChannelImageView } from "channelview";

import { enabletooltip } from "tooltip";
Object.assign(window, { enabletooltip });

import { initTabs } from "tabs";
Object.assign(window, { initTabs });

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
 * @template T, E
 * @type {CheckMapSquidRequestFn<T,E>}
 * */
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
        // add functions defined elsewhere
        getMachineDefaults,
        getHardwareCapabilities,
        getPlateTypes,
        defaultConfig,

        getConfigList,
        /** protocols stored on server @type {ConfigListEntry[]} */
        protocol_list:[],
        async refreshConfigList(){
            this.protocol_list=(await getConfigList()).configs;
        },
        storeConfig,
        /** used in GUI to configure filename when storing current config on server */
        configStoreFilename:"",
        async storeCurrentConfig(){
            const configStoreEntry={
                // structuredClone does not work on this
                config_file:JSON.parse(JSON.stringify(this.microscope_config)),
                filename:this.configStoreFilename,
                comment:this.microscope_config.comment
            };
            await storeConfig(configStoreEntry);
        },

        // keep track of global initialization state
        initDone:false,
        async manualInit(){
            await this.initSelf();
            this.initDone=true;
        },

        // keep track of number of open websockets (to limit frontend load)
        _numOpenWebsockets:0,
        /**
         * 
         * @param {MicroscopeState} data 
         */
        async updateMicroscopeStatus(data){
            const timestamps = []
            // structuredClone(data).latest_imgs?.map((c, k) => c.timestamp)
            // console.log(structuredClone(data.latest_imgs))
            for (let channelhandle of Object.keys(data.latest_imgs)) {
                const channel = data.latest_imgs[channelhandle]
                timestamps.push(channel.timestamp)
            }
            // console.log(`updateMicroscopeStatus with`, timestamps)
            // update state with data from 'data' object
            this.state=data;

            if (this._numOpenWebsockets < 1 && this.state.latest_imgs != null) {
                for (const [channel_handle, channel_info] of Object.entries(this.state.latest_imgs)) {
                    const cached_image = this.cached_channel_image.get(channel_handle)

                    const image_cache_outdated = /*no image in cache*/ (cached_image == null)
                        || /* cached image older than latest image */ (channel_info.timestamp > cached_image.info.timestamp)

                    //console.log(`${channel_handle} image_cache_outdated? ${image_cache_outdated} (${channel_info.timestamp} ${cached_image?.info.timestamp})`)
                    if (!image_cache_outdated) {
                        continue
                    }

                    const cws = new WebSocket("http://localhost:5002/ws/get_info/acquired_image")
                    //console.log("opened websocket for", channel_handle)
                    this._numOpenWebsockets++
                    /**@type {Promise<CachedChannelImage>}*/
                    const finished = new Promise((resolve, reject) => {
                        // fetch image metadata
                        cws.binaryType = "blob"
                        cws.onopen = ev => cws.send(channel_handle)
                        cws.onmessage = meta_ev => {
                            /**
                             * @type {{
                             * height: number,
                             * width: number,
                             * bit_depth: number,
                             * camera_bit_depth: number
                             * }}
                             */
                            const metadata = JSON.parse(meta_ev.data)

                            // fetch image data (into arraybuffer)
                            cws.binaryType = "arraybuffer"
                            cws.onmessage = img_ev => {
                                /** @type {ArrayBuffer} */
                                const img_data = img_ev.data

                                /** @type {CachedChannelImage} */
                                const img = Object.assign(metadata, {
                                    // store image data
                                    data: img_data,
                                    // update current channel info (latest image, incl. metadata)
                                    info: channel_info,
                                })

                                this.cached_channel_image.set(channel_handle, img)

                                // close websocket once data is received
                                cws.close()
                                this._numOpenWebsockets--

                                resolve(img)
                            }
                            // send downsample factor
                            cws.send("2")
                        }
                        cws.onerror = ev => reject(ev)
                    })
                    const data = await finished
                    console.log(data.info.channel.name, data)
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

        /** used to filter the machine config list */
        machineConfigHandleFilter:"",

        // this is an annoying workaround (in combination with initManual) because
        // alpine does not actually await an async init before mounting the element.
        // which leads to a whole bunch of errors in the console and breaks
        // some functionalities that depend on fields being initialized on mounting.
        async initSelf() {
            this._plateinfo=await getPlateTypes();
            this._microscope_config=await defaultConfig();

            // init data
            const currentStateData = await fetch("http://localhost:5002/api/get_info/current_state", {
                "method": "POST",
                "body": "{}"
            });
            if (!currentStateData.ok) throw `error in fetch. http status: ${currentStateData.status}`;
            const currentStateJson = await currentStateData.json();
            await this.updateMicroscopeStatus(currentStateJson);

            // initiate async websocket event loop to update
            /** @type {{ws?:WebSocket}} */
            let ws = {}
            const reconnect=()=>{
                try{
                    // ensure old websocket handle is closed
                    if (ws.ws != null && ws.ws.readyState != WebSocket.CLOSED) {
                        ws.ws.close();
                    }

                    // try reconnecting (may fail if server is closed, in which case just try reconnecting later)
                    ws.ws = new WebSocket("http://localhost:5002/ws/get_info/current_state");
                    ws.ws.onmessage = async ev => {
                        const data = JSON.parse(JSON.parse(ev.data));
                        await this.updateMicroscopeStatus(data);

                        requestAnimationFrame(getstate);
                    };
                    ws.ws.onerror = ev => {
                        // wait a short time before attempting to reconnect
                        setTimeout(() => reconnect(), 200);
                    };
                    ws.ws.onopen = ev => requestAnimationFrame(getstate);
                }catch(e){
                    console.warn(`websocket error: ${e}`);
                    setTimeout(() => reconnect(), 200);
                }
            };

            function getstate() {
                try {
                    if (!ws.ws || ws.ws.readyState == WebSocket.CLOSED) {
                        // trigger catch clause which will reconnect
                        throw "websocket is closed!";
                    } else if (ws.ws.readyState == WebSocket.OPEN) {
                        // send arbitrary message to receive status update
                        ws.ws.send("info");
                    } else {
                        // console.log(ws.ws.readyState, WebSocket.CLOSED, WebSocket.CONNECTING, WebSocket.OPEN)
                        // if websocket is not yet ready, try again later
                        requestAnimationFrame(getstate);
                    }
                } catch (e) {
                    // wait a short time before attempting to reconnect
                    setTimeout(() => reconnect(), 200);
                }
            }
            getstate();
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
            const body_copy=JSON.parse(JSON.stringify(body));

            // mutate copy (to fix some errors we introduce in the interface)
            // 1) remove wells that are unselected or invalid
            body_copy.config_file.plate_wells=body_copy.config_file.plate_wells.filter(w=>w.selected&&w.col>=0&&w.row>=0);

            const body_str=JSON.stringify(body_copy,null,2);

            // console.log("acquisition start body:",body_str);
            return fetch("http://localhost:5002/api/acquisition/start", {
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
                return fetch("http://localhost:5002/api/acquisition/cancel", {
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
            return fetch("http://localhost:5002/api/acquisition/status", {
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

        Actions: {
            /**
             * rpc to /api/action/move_by
             * @param {MoveByRequest} body
             * @returns {Promise<MoveByResult>}
             */
            moveBy(body) {
                return fetch("http://localhost:5002/api/action/move_by", {
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
             * 
             * @param {MoveToWellRequest} body
             * @returns {Promise<MoveToWellResponse>}
             */
            moveToWell(body) {
                return fetch("http://localhost:5002/api/action/move_to_well", {
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
            snapChannel(body) {
                return fetch("http://localhost:5002/api/action/snap_channel", {
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
            enterLoadingPosition() {
                return fetch("http://localhost:5002/api/action/enter_loading_position", {
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
            leaveLoadingPosition() {
                return fetch("http://localhost:5002/api/action/leave_loading_position", {
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
            streamBegin(body) {
                return fetch("http://localhost:5002/api/action/stream_channel_begin", {
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
            streamEnd(body) {
                return fetch("http://localhost:5002/api/action/stream_channel_end", {
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
            laserAutofocusCalibrate(body){
                return fetch("http://localhost:5002/api/action/laser_autofocus_calibrate", {
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
            laserAutofocusMoveToTargetOffset(body){
                return fetch("http://localhost:5002/api/action/laser_autofocus_move_to_target_offset", {
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
            laserAutofocusMeasureDisplacement(body){
                return fetch("http://localhost:5002/api/action/laser_autofocus_measure_displacement", {
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
                    console.log(v);
                    return v;
                });
            },
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

            return fetch("http://localhost:5002/api/action/stream_channel_begin", {
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

            return fetch("http://localhost:5002/api/action/stream_channel_end", {
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

        /**
         * position where reference was set
         * @type {{pos:AdapterPosition}|null}
         */
        laserAutofocusReference:null,
        /**
         * offset and position where it was measured
         * @type {{offset_um:number,pos:AdapterPosition}|null}
         */
        laserAutofocusMeasuredOffset:null,
        /**
         * 
         * @param {MouseEvent} ev 
         */
        async buttons_calibrateLaserAutofocusHere(ev){
            // this calibrates the system and sets the current z as reference
            // -> store for later retrieval
            const calibration_data=await this.Actions.laserAutofocusCalibrate({});
            console.log(`calibrated laser autofocus system`,calibration_data);
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
