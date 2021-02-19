/*
 * Copyright (C) 2020 con terra GmbH (info@conterra.de)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import PopupTemplate from "esri/PopupTemplate";
import CustomContent from "esri/popup/content/CustomContent";
import Feature from "esri/widgets/Feature";
import FeatureLayer from "esri/layers/FeatureLayer";
import Field from "esri/layers/support/Field";
import moment from "moment";

export default class PopupDefinition {

    constructor(popupWidgetFactory, queryController, properties) {
        this.popupWidgetFactory = popupWidgetFactory;
        this.queryController = queryController;
        this.properties = properties;
    }

    resolvePopupTemplate(layerOrSublayer) {
        let url = layerOrSublayer.url;
        const layerId = layerOrSublayer.layerId;
        if (layerId) {
            url = url + "/" + layerId;
        }
        const queryController = this.queryController;
        return queryController.getMetadata(url).then((metadata) => {
            if (metadata.fields) {
                const fields = metadata.fields;
                const displayField = metadata.displayField;
                const objectIdField = this._getObjectIdField(metadata.fields).name;

                const customContentWidget = this._getCustomContent(layerOrSublayer,
                    displayField, objectIdField, fields);

                let content;
                if(layerOrSublayer.popupTemplate.content.length) {
                    content = [...layerOrSublayer.popupTemplate.content, ...[customContentWidget]];
                } else {
                    content = [customContentWidget];
                }

                const template = new PopupTemplate({
                    outFields: ["*"],
                    title: layerOrSublayer.popupTemplate?.title || "{" + displayField + "}",
                    content: content
                });

                return template;
            }
        });
    }

    _getCustomContent(layerOrSublayer, displayField, objectIdField, fields) {
        return new CustomContent({
            outFields: ["*"],
            creator: ({graphic}) => {
                const widget = this.popupWidgetFactory.getWidget();
                widget.startup();

                const vm = widget.getVM();
                const featureWidget = new Feature({
                    graphic: null,
                    container: vm.$refs.featureWidget
                });
                vm.$on('related-record-changed', (relatedRecord) => {
                    const g =  this._getGraphic(relatedRecord);
                    featureWidget.graphic = g;
                });

                const sourceLayer = graphic.sourceLayer || layerOrSublayer;
                displayField = displayField || sourceLayer.displayField;
                objectIdField = objectIdField || sourceLayer.objectIdField;
                const objectId = graphic.attributes[objectIdField];
                widget.set("relatedRecordsData", []);

                this._getRelatedRecordsData(sourceLayer, objectId, widget).then((relatedRecordsData) => {
                    widget.set("relatedRecordsData", relatedRecordsData);
                    widget.set("selectedRelatedRecordsData", relatedRecordsData[0]);
                    const g = this._getGraphic(relatedRecordsData[0].active);
                    featureWidget.graphic = g;
                });
                return widget.domNode;
            }
        });
    }

    _getGraphic(relatedRecord) {
        const layer = new FeatureLayer({
            source: [],
            fields: relatedRecord.fields
        });
        return {
            layer: layer,
            attributes: relatedRecord.attributes,
            popupTemplate: {
                //title: relatedRecord.title,
                content: [
                    {
                        type: "fields",
                        fieldInfos: relatedRecord.fields.map((field)=>{
                            return {
                                fieldName: field.name,
                                label: field.alias || field.name
                            }
                        })
                    }
                ]
            }
        }
    }

    _getRelatedRecordsData(sourceLayer, objectId, widget) {
        let url = sourceLayer.url;
        const layerId = sourceLayer.layerId;
        if (layerId) {
            url = url + "/" + layerId;
        }
        widget.set("loading", true);

        const queryController = this.queryController;
        return queryController.getMetadata(url)
            .then((metadata) => queryController.getRelatedMetadata(url, metadata)
                .then((relatedMetadata) => queryController.findRelatedRecords(objectId, url, metadata)
                    .then((results) => {
                        const relatedRecordsData = [];
                        if (!results) {
                            widget.set("loading", false);
                            return relatedRecordsData;
                        }
                        results.forEach((result, i) => {
                            const relatedRecords = [];
                            const metadata = relatedMetadata[i];
                            const relatedRecordGroups = result.relatedRecordGroups;
                            relatedRecordGroups.forEach((relatedRecordGroup) => {
                                relatedRecordGroup.relatedRecords.forEach((record) => {
                                    const attributes = record.attributes;
                                    const objectIdField = this._getObjectIdField(metadata.fields);
                                    relatedRecords.push({
                                        id: metadata.id + "_" + attributes[objectIdField.name],
                                        title: attributes[this._replaceDisplayField(metadata)],
                                        attributes: attributes,
                                        fields: metadata.fields.map((field) => Field.fromJSON(field)),
                                        objectIdField: objectIdField
                                    });
                                });
                            });
                            relatedRecordsData.push({
                                id: metadata.id,
                                title: this._replaceRelationName(metadata.name),
                                relatedRecords: relatedRecords,
                                active: relatedRecords[0]
                            });
                        });
                        widget.set("loading", false);
                        return relatedRecordsData;
                    })
                )
            );
    }

    _replaceRelationName(name) {
        const relationNameReplacer = this.properties.relationNameReplacer;
        const replacerObject = relationNameReplacer.find((replacer) => replacer.name === name);
        if (replacerObject) {
            return replacerObject.newName;
        } else {
            return name;
        }
    }

    _replaceDisplayField(metadata) {
        const displayfieldReplacer = this.properties.displayfieldReplacer;
        const replacerObject = displayfieldReplacer.find((replacer) => replacer.name === metadata.name);
        if (replacerObject) {
            return replacerObject.newField;
        } else {
            return metadata.displayField;
        }
    }

    _getObjectIdField(fields) {
        return fields.find((field) => field.type === "esriFieldTypeOID");
    }

}
