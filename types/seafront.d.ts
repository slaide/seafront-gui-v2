// throw `MUST NOT IMPORT THIS TYPEMAP!`

import * as THREE from "three";

declare global {
    type AcquisitionChannelConfig = {
        name: string,
        handle: string,
        analog_gain: number,
        exposure_time_ms: number,
        illum_perc: number,
        num_z_planes: number,
        z_offset_um: number,
        enabled: boolean,
    };

    type ChannelInfo = {
        channel: AcquisitionChannelConfig,
        height_px: number,
        width_px: number,
        storage_path: string | undefined,
        position: {},
        timestamp: number
    };

    /**
     * microscope state, combines actual microscope telemetry with UI state
     */
    type MicroscopeState = {
        adapter_state: {
            is_in_loading_position: boolean,
            state: "idle",
            stage_position: { x_pos_mm: number, y_pos_mm: number, z_pos_mm: number }
        },
        current_acquisition_id: string | undefined,
        latest_imgs: { [channel_handle: string]: ChannelInfo },
    };
    type Version = {
        major: number,
        minor: number,
        patch: number,
    };
    type AcquisitionWellSiteConfigurationSiteSelectionItem = {
        row: number,
        col: number,
        selected: boolean,
    };
    type AcquisitionWellSiteConfiguration = {
        num_x: number,
        delta_x_mm: number,
        num_y: number,
        delta_y_mm: number,
        num_t: number,
        delta_t: {
            h: number,
            m: number,
            s: number,
        },
        masks: AcquisitionWellSiteConfigurationSiteSelectionItem[]
    };
    type PlateWellConfig = {
        row: number,
        col: number,
        selected: boolean,
    };
    type AcquisitionConfig = {
        project_name: string,
        plate_name: string,
        cell_line: string,
        plate_wells: PlateWellConfig[],
        grid: AcquisitionWellSiteConfiguration,
        autofocus_enabled: boolean,
        comment: string | null,
        machine_config: any[],
        wellplate_type: Wellplate,
        timestamp: string | null,
        channels: AcquisitionChannelConfig[],
        spec_version?: Version,
    };

    type CachedChannelImage = {
        height: number,
        width: number,
        bit_depth: number,
        camera_bit_depth: number,
        data: ArrayBuffer,
        info: ChannelInfo,
    };

    type ChannelImageData = {
        width: number,
        height: number,
        data: ArrayBuffer | Uint16Array | Uint8Array,
        texture: THREE.DataTexture,
        mesh: THREE.Mesh
    };

    type SceneInfo = {
        channelhandle: string,
        scene: THREE.Scene,
        camera: THREE.OrthographicCamera,
        elem: HTMLElement,
        mesh?: THREE.Mesh,
        img?: ChannelImageData
    };
}

declare global {
    type Pos2 = { x: number, y: number };
    type AABB = { ax: number, ay: number, bx: number, by: number };
}

declare global {
    type Wellplate = {
        Manufacturer: string,
        Model_id: string,
        Model_id_manufacturer: string,
        Model_name: string,
        Num_wells_x: number,
        Num_wells_y: number,
        Offset_A1_x_mm: number,
        Offset_A1_y_mm: number,
        Width_mm: number,
        Length_mm: number,
        Offset_bottom_mm: number,
        Well_distance_x_mm: number,
        Well_distance_y_mm: number,
        Well_size_x_mm: number,
        Well_size_y_mm: number,
        Well_edge_radius_mm: number,
    };

    type BasicSuccessResponse = {};

    type MoveByResult = {
        axis: string,
        moved_by_mm: number,
    };
    // truly empty
    type MoveToWellRequest = {
        plate_type: Wellplate,
        well_name: string
    };
    type MoveToWellResponse = BasicSuccessResponse;

    type ConfigItem = {};
    type MachineConfigItem = ConfigItem;

    type ImageAcquiredResponse = {}
    type ChannelSnapshotRequest = {
        channel: AcquisitionChannelConfig,
        machine_config?: MachineConfigItem[],
    };
    type ChannelSnapshotResponse = ImageAcquiredResponse;

    type StreamBeginRequest = {
        framerate_hz: number;
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
        main_camera_imaging_channels: AcquisitionChannelConfig[],
        wellplate_types: Wellplate[],
    };
}

// this line ensures that the 'declare global' are visible by the LSP in other .js files
export { }