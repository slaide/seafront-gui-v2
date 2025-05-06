import * as THREE from "three";

declare global {
    type float=number;
    type int=number;

    /**
     * has html status code 500
     * */
    type InternalErrorModel={
        detail:string;
    };

    type AcquisitionChannelConfig = {
        name: string;
        handle: string;
        analog_gain: float;
        exposure_time_ms: float;
        illum_perc: float;
        num_z_planes: int;
        z_offset_um: float;
        enabled: boolean;
    };

    type ChannelInfo = {
        channel: AcquisitionChannelConfig;
        height_px: int;
        width_px: int;
        storage_path: string | undefined;
        position: {};
        timestamp: float;
    };

    /**
     * microscope state, combines actual microscope telemetry with UI state
     */
    type MicroscopeState = {
        adapter_state: {
            is_in_loading_position: boolean;
            state: "idle";
            stage_position: {
                x_pos_mm: float;
                y_pos_mm: float;
                z_pos_mm: float;
            };
        };
        current_acquisition_id: string | undefined;
        latest_imgs: {
            [channel_handle: string]: ChannelInfo;
        };
    };
    type Version = {
        major: int;
        minor: int;
        patch: int;
    };
    type AcquisitionWellSiteConfigurationSiteSelectionItem = {
        row: int;
        col: int;
        selected: boolean;
    };
    type AcquisitionWellSiteConfiguration = {
        num_x: int;
        delta_x_mm: float;
        num_y: int;
        delta_y_mm: float;
        num_t: int;
        delta_t: {
            h: float;
            m: float;
            s: float;
        };
        mask: AcquisitionWellSiteConfigurationSiteSelectionItem[];
    };
    type PlateWellConfig = {
        row: int;
        col: int;
        selected: boolean;
    };
    type AcquisitionConfig = {
        project_name: string;
        plate_name: string;
        cell_line: string;
        plate_wells: PlateWellConfig[];
        grid: AcquisitionWellSiteConfiguration;
        autofocus_enabled: boolean;
        comment: string | null;
        machine_config: any[];
        wellplate_type: Wellplate;
        timestamp: string | null;
        channels: AcquisitionChannelConfig[];
        spec_version?: Version;
    };

    type CachedChannelImage = {
        height: int;
        width: int;
        bit_depth: int;
        camera_bit_depth: int;
        data: ArrayBuffer;
        info: ChannelInfo;
    };

    type ChannelImageData = {
        width: int;
        height: int;
        data: ArrayBuffer | Uint16Array | Uint8Array;
        texture: THREE.DataTexture;
        mesh: THREE.Mesh;
    };

    type SceneInfo = {
        channelhandle: string;
        scene: THREE.Scene;
        camera: THREE.OrthographicCamera;
        elem: HTMLElement;
        mesh?: THREE.Mesh;
        img?: ChannelImageData;
    };
}

declare global {
    type Pos2 = {
        x: float;
        y: float;
    };
    type AABB = {
        ax: float;
        ay: float;
        bx: float;
        by: float;
    };
}

declare global {
    type Wellplate = {
        Manufacturer: string;
        Model_id: string;
        Model_id_manufacturer: string;
        Model_name: string;
        Num_wells_x: int;
        Num_wells_y: int;
        Offset_A1_x_mm: float;
        Offset_A1_y_mm: float;
        Width_mm: float;
        Length_mm: float;
        Offset_bottom_mm: float;
        Well_distance_x_mm: float;
        Well_distance_y_mm: float;
        Well_size_x_mm: float;
        Well_size_y_mm: float;
        Well_edge_radius_mm: float;
    };

    type BasicSuccessResponse = {};

    type MoveByRequest = {
        axis:"x"|"y"|"z";
        distance_mm:float;
    };
    type MoveByResult = {
        axis: string;
        moved_by_mm: float;
    };
    // truly empty
    type MoveToWellRequest = {
        plate_type: Wellplate;
        well_name: string;
    };
    type MoveToWellResponse = BasicSuccessResponse;

    type ConfigItem = {};
    type MachineConfigItem = ConfigItem;

    type ImageAcquiredResponse = {}
    type ChannelSnapshotRequest = {
        channel: AcquisitionChannelConfig;
        machine_config?: MachineConfigItem[];
    };
    type ChannelSnapshotResponse = ImageAcquiredResponse;

    type StreamBeginRequest = {
        framerate_hz: float;
        channel: AcquisitionChannelConfig;

        machine_config?: MachineConfigItem[];
    };
    type StreamingStartedResponse = {
        channel: AcquisitionChannelConfig;
    };
    type StreamBeginResponse = StreamingStartedResponse;

    type StreamEndRequest = {
        channel: AcquisitionChannelConfig;
        machine_config?: MachineConfigItem[];
    };
    type StreamEndResponse = BasicSuccessResponse;

    type EnterLoadingPositionResponse = {};
    type LeaveLoadingPositionResponse = {};

    type HardwareCapabilities = {
        main_camera_imaging_channels: AcquisitionChannelConfig[];
        wellplate_types: Wellplate[];
    };

    type AcquisitionStartRequest={
        config_file:AcquisitionConfig;
    };
    type AcquisitionStartResponse={
        acquisition_id: string;
    };
    type AcquisitionStopRequest={
        acquisition_id:string;
    };
    type AcquisitionStopResponse={};

    type AdapterPosition={
        x_pos_mm:float;
        y_pos_mm:float;
        z_pos_mm:float;
    };
    type SitePosition={
        well_name:string;
        site_x:int;
        site_y:int;
        site_z:int;
    
        x_offset_mm:float;
        y_offset_mm:float;
        z_offset_mm:float;
    
        position:AdapterPosition;
    };
    type ImageStoreInfo={
        channel:AcquisitionChannelConfig;
        width_px:int;
        height_px:int;
        timestamp:float;
    
        position:SitePosition;
    
        storage_path:string|null;
    };
    type AcquisitionStatusStage=
        "running"
        |"cancelled"
        |"completed"
        |"crashed"
        |"scheduled";
    type AcquisitionProgressStatus={
        current_num_images:int;
        time_since_start_s:float;
        start_time_iso:string;
        current_storage_usage_GB:float;

        estimated_remaining_time_s:float|null;
    
        last_image:ImageStoreInfo|null;
    };
    type AcquisitionMetaInformation={
        total_num_images:int;
        max_storage_size_images_GB:float;
    };
    type AcquisitionStatusOut={
        acquisition_id:string;
        acquisition_status:AcquisitionStatusStage;
        acquisition_progress:AcquisitionProgressStatus;
    
        acquisition_meta_information:AcquisitionMetaInformation;
    
        acquisition_config:AcquisitionConfig;
    
        message:string;
    };
    type AcquisitionStatusRequest={
        acquisition_id:string;
    };
    type AcquisitionStatusResponse=AcquisitionStatusOut;
    type AcquisitionStartError=InternalErrorModel;
}

// this line ensures that the 'declare global' are visible by the LSP in other .js files
export { }