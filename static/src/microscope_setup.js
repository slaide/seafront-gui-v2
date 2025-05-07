"use strict";

/**
 * @returns {Promise<HardwareCapabilities>}
 */
export async function getHardwareCapabilities() {
    const plateinfo=await fetch("http://localhost:5002/api/get_features/hardware_capabilities",{
        method:"POST",
        body:"{}",
        headers: [
            ["Content-Type", "application/json"]
        ]
    }).then(v=>{
        /** @ts-ignore @type {CheckMapSquidRequestFn<HardwareCapabilities,InternalErrorModel>} */
        const check=checkMapSquidRequest;
        return check(v)
    });

    return plateinfo;
}
/**
 * @returns {Promise<MachineDefaults>}
 */
export async function getMachineDefaults(){
    const machinedefaults=await fetch("http://localhost:5002/api/get_features/machine_defaults",{
        method:"POST",
        body:"{}",
        headers: [
            ["Content-Type", "application/json"]
        ]
    }).then(v=>{
        /** @ts-ignore @type {CheckMapSquidRequestFn<MachineDefaults,InternalErrorModel>} */
        const check=checkMapSquidRequest;
        return check(v)
    });

    return machinedefaults;
}

/**
 * @returns {Promise<ConfigListResponse>}
 */
export async function getConfigList(){
    const configlist=await fetch("http://localhost:5002/api/acquisition/config_list",{
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
    console.log("configlistresponse",configlist)

    return configlist;
}

/**
 * @param {StoreConfigRequest} body
 * @returns {Promise<StoreConfigResponse>}
 */
export async function storeConfig(body){
    const response=await fetch("http://localhost:5002/api/acquisition/config_store",{
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

    console.log(`got response`,response);

    return response;
}

/**
 * get plate types from server
 * @returns {Promise<{plategroups:WellPlateGroup[],allplates:Wellplate[]}>}
 * */
export async function getPlateTypes() {
    let data = await getHardwareCapabilities();

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
}

/**
 * @return {Promise<AcquisitionConfig>}
 **/
export async function defaultConfig() {
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

        channels: (await getHardwareCapabilities()).main_camera_imaging_channels,

        machine_config: await getMachineDefaults(),
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
}
