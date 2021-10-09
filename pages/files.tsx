import { useEffect, useState } from "react";
import { useSelector, useDispatch } from 'react-redux'
import { RootState } from '../data/store'
import { load, setArmyFile } from '../data/armySlice'
import { useRouter } from 'next/router';
import { Button, Card, Dialog, TextField } from "@mui/material";
import { AppBar, IconButton, Paper, Toolbar, Typography } from '@mui/material';
import BackIcon from '@mui/icons-material/ArrowBackIosNew';
import RightIcon from "@mui/icons-material/KeyboardArrowRight";
import ClearIcon from '@mui/icons-material/Clear';
import WarningIcon from "@mui/icons-material/Warning";
import { dataToolVersion } from "./data";
import DataParsingService from "../services/DataParsingService";
import { nanoid } from "nanoid";
import { IUnit, IUpgradeOption } from "../data/interfaces";
import { resetList } from "../data/listSlice";
import CreateListDialog from "../views/CreateListDialog";

const rotations = {} as any;

export default function Files() {

  const army = useSelector((state: RootState) => state.army);
  const [armyFiles, setArmyFiles] = useState(null);
  const [customArmies, setCustomArmies] = useState(null);
  const [driveArmies, setDriveArmies] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [newArmyDialogOpen, setNewArmyDialogOpen] = useState(false);
  const dispatch = useDispatch();
  const router = useRouter();

  const useStaging: boolean = false;
  //const webCompanionUrl = `https://opr-list-builder${useStaging ? "-staging" : ""}.herokuapp.com/api`;
  const webCompanionUrl = 'https://opr-list-bui-feature-po-r8wmtp.herokuapp.com/api';

  useEffect(() => {

    // Redirect to game selection screen if no army selected
    if (!army.gameSystem) {
      router.push("/", null, { shallow: true });
      return;
    }

    // Clear any existing units?
    dispatch(resetList());

    // List of "official" armies from AF
    fetch("definitions/army-files.json")
      .then((res) => res.json())
      .then((data) => {
        setArmyFiles(data);
      });

    const driveIds = {
      aof: "15XasmVSfFCASeLysRlyjXdx6qA3WKLlf",
      gf: "1-wSo6Rvi-M5qAcZy-7aQD_kNBynIqWT9",
      aofs: "1U1TmXXe7NG1VX0SV57nCjNGFMOgJzcSO",
      gff: "1gXXoQ2Gj5Xz7OjBHMQ_VfsyonUe2Z1wn"
    };

    fetch("https://www.googleapis.com/drive/v3/files?q='" + driveIds[army.gameSystem] + "'%20in%20parents&key=AIzaSyDsl1Ux-3orA02dV2Mrw4v-Xv0phHUtfnU")
      .then((res) => res.json())
      .then((res) => {
        // No error handling? fingers crossed
        setDriveArmies(res.files.map(f => {
          const name = f.name.substring(f.name.indexOf("-") + 1).trim();
          const match = /(.+)\sv(\d+\.\d+)/.exec(name);
          return {
            name: match[1],
            version: match[2]
          };
        }));
      });

    // AF to Web Companion game type mapping
    const slug = (() => {
      switch (army.gameSystem) {
        case "gf": return "grimdark-future";
        case "gff": return "grimdark-future-firefight";
        case "aof": return "age-of-fantasy";
        case "aofs": return "age-of-fantasy-skirmish";
      }
    })();

    const loadCustomArmies = true;
    if (loadCustomArmies) {
      // Load custom data books from Web Companion
      fetch(webCompanionUrl + "/army-books?gameSystemSlug=" + slug)
        .then((res) => res.json())
        .then((data) => {
          console.log(data);
          const valid = data
            .filter(a => a.unitCount > 2)
          //.filter(a => useStaging || a.username === "Darguth" || a.username === "adam");

          setCustomArmies(valid);
        });
    }
  }, []);

  const transform = (input) => {
    const countRegex = /^(\d+)x\s/;

    return {
      ...input,
      units: input.units.map((u: IUnit) => ({
        ...u,
        equipment: u.equipment.map(e => {
          // Capture the count digit from the name
          const countMatch = countRegex.exec(e.label);
          return {
            ...e,
            label: e.label.replace(countRegex, ""),
            count: countMatch ? parseInt(countMatch[1]) * u.size : u.size
          }
        })
      })),
      upgradePackages: input.upgradePackages.map(pkg => ({
        ...pkg,
        sections: pkg.sections.map(section => ({
          ...section,
          ...DataParsingService.parseUpgradeText(section.label),
          options: section.options.map((opt: IUpgradeOption) => {
            const gains = [];
            // Iterate backwards through gains array so we can push new 
            for (let original of opt.gains) {
              // Match "2x ", etc

              // Replace "2x " in label/name of original gain
              const gain = {
                ...original,
                label: original.label?.replace(countRegex, ""),
                name: original.name?.replace(countRegex, "")
              };
              // Capture the count digit from the name
              const countMatch = countRegex.exec(original.name);
              // Parse the count if present, otherwise default to 1
              const count = countMatch ? parseInt(countMatch[1]) : 1;
              // Push the gain into the array as many times as the count
              for (let y = 0; y < count; y++) {
                gains.push(gain);
              }
            }
            return ({
              ...opt,
              id: opt.id || nanoid(5), // Assign ID to upgrade option if one doesn't exist
              gains
            });
          })
        }))
      }))
    };
  };

  const selectArmy = (filePath: string) => {
    // TODO: Clear existing data

    // Set army file
    dispatch(setArmyFile(filePath));

    // Load army data
    fetch(filePath)
      .then((res) => res.json())
      .then((data) => {
        console.log(data);

        dispatch(load(data));

        // TODO: Loading wheel view...?
        // Redirect to list builder once data is loaded
        //router.push('/list');
        setNewArmyDialogOpen(true);
      });
  };

  const selectCustomList = (customArmy: any) => {

    // TODO: Web companion integration
    // Load army data
    fetch(webCompanionUrl + `/army-books/${customArmy.uid}`)
      .then((res) => res.json())
      .then((data) => {
        console.log(data);

        const afData = transform(data);
        console.log(afData);

        // var allSections = afData.upgradePackages.reduce((value, pkg) => value.concat(pkg.sections), []);
        // var allOptions = allSections.reduce((value, section) => value.concat(section.options), []);
        // console.log("Sections:", allSections);
        // console.log("Options:", allOptions);
        // console.log("Options with gains as string:", allOptions.filter(opt => typeof(opt.gains[0]) === "string"));

        dispatch(load(afData));

        // TODO: Loading wheel view...?
        // Redirect to list builder once data is loaded
        router.push('/list');
      });
  };

  const armies = armyFiles?.filter(grp => grp.key === army.gameSystem)[0].items;

  return (
    <>
      <Paper elevation={2} color="primary" square>
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2 }}
              onClick={() => router.back()}
            >
              <BackIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Create new list
            </Typography>
          </Toolbar>
        </AppBar>
      </Paper>
      <div className="container">
        <div className="mx-auto p-4" style={{ maxWidth: "480px" }}>
          <h3 className="is-size-4 has-text-centered mb-4 pt-4">Choose your army</h3>
          <div className="columns is-mobile is-multiline">
            {
              !armyFiles ? null : armies.map((file, index) => {
                const driveArmy = driveArmies && driveArmies.filter(army => file.name.toUpperCase() === army?.name?.toUpperCase())[0];

                return (
                  <div key={index} className="column is-half">
                    <Card
                      elevation={2}
                      onClick={() => selectArmy(file.path)}>
                      <div className="mt-2 is-flex is-flex-direction-column is-flex-grow-1">
                        <div className="is-flex p-2" style={{ position: "relative", height: "100px", boxSizing: "content-box" }}>
                          <div style={{
                            zIndex: 0,
                            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                            backgroundImage: `url("img/army_bg.png")`,
                            backgroundPosition: "center",
                            backgroundSize: "contain",
                            backgroundRepeat: 'no-repeat',
                            transform: `rotate(${rotations[file.name] || (rotations[file.name] = 360 * Math.random())}deg)`
                          }}></div>
                          <div className="is-flex" style={{
                            height: "100px",
                            width: "100%",
                            backgroundImage: `url("img/gf_armies/${file.name}.png")`,
                            backgroundPosition: "center",
                            backgroundSize: "contain",
                            backgroundRepeat: 'no-repeat',
                            position: "relative", zIndex: 1
                          }}></div>
                        </div>
                        <div className="is-flex is-flex-grow-1 is-align-items-center">
                          <div className="is-flex-grow-1" onClick={() => setExpandedId(file.name)}>
                            <p className="my-2" style={{ fontWeight: 600, textAlign: "center", fontSize: "14px" }}>{file.name}</p>
                          </div>
                          {driveArmy && driveArmy.version > file.version && <div className="mr-4" title="Army file may be out of date"><WarningIcon /></div>}
                          {file.dataToolVersion !== dataToolVersion && <div className="mr-4" title="Data file may be out of date"><WarningIcon /></div>}
                        </div>
                      </div>
                    </Card>
                  </div>
                  // <li key={index} className="mb-4">
                  //     <Button variant="contained" color="primary" onClick={() => selectArmy(file.path)}>
                  //         {file.name}
                  //     </Button>
                  // </li>
                );
              })
            }
          </div>

          {customArmies && <>
            <h3>Custom Armies</h3>
            <div className="columns is-multiline">
              {customArmies.map((customArmy, i) => (
                <div key={i} className="column is-half">
                  <Card
                    elevation={1}
                    onClick={(e) => { e.stopPropagation(); selectCustomList(customArmy); }}>
                    <div className="is-flex is-flex-grow-1 is-align-items-center p-4">
                      <div className="is-flex-grow-1">
                        <p className="mb-1" style={{ fontWeight: 600 }}>{customArmy.name}</p>
                        <div className="is-flex" style={{ fontSize: "14px", color: "#666" }}>
                          by {customArmy.username}
                          {/* <p>Qua {u.quality}</p>
                                            <p className="ml-2">Def {u.defense}</p> */}
                        </div>
                      </div>
                      {/* <p className="mr-2">{u.cost}pts</p> */}
                      <IconButton color="primary">
                        <RightIcon />
                      </IconButton>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </>
          }
        </div>
      </div>
      <CreateListDialog open={newArmyDialogOpen} setOpen={setNewArmyDialogOpen} />
    </>
  );
}