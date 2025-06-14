// src/renderer/pages/main-page/views/plugin-manager-view/components/plugin-table/index.tsx
import AppConfig from "@shared/app-config/renderer";
import React, { CSSProperties, ReactNode } from "react";
import {
  useReactTable,
  createColumnHelper,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";
import "./index.scss";
import Condition, { IfTruthy } from "@/renderer/components/Condition";
import { hideModal, showModal } from "@/renderer/components/Modal";
import Empty from "@/renderer/components/Empty";
import { toast } from "react-toastify";
import { showPanel } from "@/renderer/components/Panel";
import DragReceiver, { startDrag } from "@/renderer/components/DragReceiver";
import { produce } from "immer";
import { i18n } from "@/shared/i18n/renderer";
import PluginManager, {useSortedPlugins} from "@shared/plugin-manager/renderer";

const t = i18n.t;

function renderOptions(info: any) {
  const row = info.row.original as IPlugin.IPluginDelegate;

  return (
    <div>
      <ActionButton
        style={{
          color: "var(--dangerColor, #FC5F5F)",
        }}
        onClick={() => {
          showModal("Reconfirm", {
            title: t("plugin_management_page.uninstall_plugin"),
            content: t("plugin_management_page.confirm_text_uninstall_plugin", {
              plugin: row.platform,
            }),
            async onConfirm() {
              hideModal();
              try {
                await PluginManager.uninstallPlugin(row.hash);
                toast.success(
                  t("plugin_management_page.uninstall_successfully", {
                    plugin: row.platform,
                  })
                );
              } catch {
                toast.error(t("plugin_management_page.uninstall_failed"));
              }
            },
          });
        }}
      >
        {t("plugin_management_page.uninstall")}
      </ActionButton>
      <Condition condition={row.srcUrl}>
        <ActionButton
          style={{
            color: "var(--successColor, #08A34C)",
          }}
          onClick={async () => {
            try {
              await PluginManager.installPluginFromRemote(row.srcUrl);
              toast.success(
                t("plugin_management_page.toast_plugin_is_latest", {
                  plugin: row.platform,
                })
              );
            } catch (e) {
              toast.error(
                e?.message ?? t("plugin_management_page.update_failed")
              );
            }
          }}
        >
          {t("plugin_management_page.update")}
        </ActionButton>
      </Condition>

      <Condition condition={row.supportedMethod.includes("importMusicItem")}>
        <ActionButton
          style={{
            color: "var(--infoColor, #0A95C8)",
          }}
          onClick={() => {
            showModal("SimpleInputWithState", {
              title: t("plugin.method_import_music_item"),
              withLoading: true,
              loadingText: t("plugin_management_page.importing_media"),
              placeholder: t(
                "plugin_management_page.placeholder_import_music_item",
                {
                  plugin: row.platform,
                }
              ),
              maxLength: 1000,
              onOk(text) {
                return PluginManager.callPluginDelegateMethod(
                  row,
                  "importMusicItem",
                  text.trim()
                );
              },
              onPromiseResolved(result) {
                hideModal();
                showModal("AddMusicToSheet", {
                  musicItems: result as IMusic.IMusicItem[],
                });
              },
              onPromiseRejected() {
                console.log(t("plugin_management_page.import_failed"));
              },
              hints: row.hints?.importMusicItem,
            });
          }}
        >
          {t("plugin.method_import_music_item")}
        </ActionButton>
      </Condition>
      <Condition condition={row.supportedMethod.includes("importMusicSheet")}>
        <ActionButton
          style={{
            color: "#0A95C8",
          }}
          onClick={() => {
            showModal("SimpleInputWithState", {
              title: t("plugin.method_import_music_sheet"),
              withLoading: true,
              loadingText: t("plugin_management_page.importing_media"),
              placeholder: t(
                "plugin_management_page.placeholder_import_music_sheet",
                {
                  plugin: row.platform,
                }
              ),
              maxLength: 1000,
              onOk(text) {
                return PluginManager.callPluginDelegateMethod(
                  row,
                  "importMusicSheet",
                  text.trim()
                );
              },
              onPromiseResolved(result) {
                hideModal();
                showModal("AddMusicToSheet", {
                  musicItems: result as IMusic.IMusicItem[],
                });
              },
              onPromiseRejected() {
                toast.error(t("plugin_management_page.import_failed"));
              },
              hints: row.hints?.importMusicSheet,
            });
          }}
        >
          {t("plugin.method_import_music_sheet")}
        </ActionButton>
      </Condition>
      <Condition condition={row.userVariables?.length}>
        <ActionButton
          style={{
            color: "#0A95C8",
          }}
          onClick={() => {
            showPanel("UserVariables", {
              variables: row.userVariables,
              plugin: row,
              initValues:
                AppConfig.getConfig("private.pluginMeta")?.[row.platform]
                  ?.userVariables,
            });
          }}
        >
          {t("plugin.prop_user_variable")}
        </ActionButton>
      </Condition>
    </div>
  );
}

const columnHelper = createColumnHelper<IPlugin.IPluginDelegate>();
const columnDef = [
  columnHelper.accessor((_, index) => index + 1, {
    id: "id",
    cell(info) {
      return info.getValue();
    },
    header: () => "#",
    minSize: 64,
    maxSize: 64,
    size: 64,
  }),
  columnHelper.accessor("platform", {
    cell: (info) => info.getValue(),
    header: () => t("media.media_platform"),
    minSize: 150,
    size: 200,
  }),
  columnHelper.accessor("version", {
    cell: (info) => info.getValue(),
    header: () => t("common.version_code"),
    minSize: 100,
    maxSize: 100,
    size: 100,
  }),
  columnHelper.accessor("author", {
    cell: (info) => info.getValue() ?? t("media.unknown_artist"),
    header: () => t("media.media_type_artist"),
    maxSize: 100,
    minSize: 100,
    size: 100,
  }),
  columnHelper.accessor(() => 0, {
    id: "extra",
    cell: renderOptions,
    header: () => t("common.operation"),
  }),
];

export default function PluginTable() {
  const plugins = useSortedPlugins();
  const table = useReactTable({
    data: plugins,
    columns: columnDef,
    getCoreRowModel: getCoreRowModel(),
  });

  function onDrop(fromIndex: number, toIndex: number) {
    const meta = AppConfig.getConfig("private.pluginMeta") ?? {};

    const newPlugins = plugins
      .slice(0, fromIndex)
      .concat(plugins.slice(fromIndex + 1));
    newPlugins.splice(
      fromIndex < toIndex ? toIndex - 1 : toIndex,
      0,
      plugins[fromIndex]
    );

    const newMeta = produce(meta, (draft) => {
      newPlugins.forEach((plugin, index) => {
        if (!draft[plugin.platform]) {
          draft[plugin.platform] = {};
        }
        draft[plugin.platform].order = index;
      });
    });

    AppConfig.setConfig({
      "private.pluginMeta": newMeta
    });
  }

  const dragReceiverRowStyle: React.CSSProperties = {
    height: 0,
    padding: 0,
    margin: 0,
    border: 'none',
    lineHeight: 0,
  };

  const dragReceiverCellStyle: React.CSSProperties = {
    height: 0,
    padding: 0,
    border: 'none',
    position: 'relative',
  };


  return (
    <div className="plugin-table--container">
      <Condition
        condition={table.getRowModel().rows.length}
        falsy={<Empty></Empty>}
      >
        <table>
          <thead>
            <tr>
              {table.getHeaderGroups()[0].headers.map((header) => (
                <th
                  key={header.id}
                  style={{
                    width: header.id === "extra" ? "100%" : header.getSize(),
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, index) => (
              <React.Fragment key={row.id}>
                {index === 0 && (
                  <tr style={dragReceiverRowStyle} data-row-type="drag-receiver">
                    <td
                      colSpan={table.getHeaderGroups()[0].headers.length}
                      style={dragReceiverCellStyle}
                    >
                      <DragReceiver
                        position="top"
                        rowIndex={0}
                        onDrop={onDrop}
                      />
                    </td>
                  </tr>
                )}
                <tr
                  draggable
                  onDragStart={(e) => {
                    startDrag(e, index);
                  }}
                  data-row-type="data" // 添加标记
                >
                  {row.getAllCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{
                        width: cell.column.getSize(),
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
                <tr style={dragReceiverRowStyle} data-row-type="drag-receiver">
                  <td
                    colSpan={table.getHeaderGroups()[0].headers.length}
                    style={dragReceiverCellStyle}
                  >
                    <DragReceiver
                      position="bottom"
                      rowIndex={index + 1}
                      onDrop={onDrop}
                    />
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </Condition>
    </div>
  );
}

interface IActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}
function ActionButton(props: IActionButtonProps) {
  const { children, onClick, style } = props;
  return (
    <span className="action-button" onClick={onClick} style={style}>
      {children}
    </span>
  );
}