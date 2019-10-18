/*
 * Copyright (C) 2019 con terra GmbH (info@conterra.de)
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
import moment from "esri/moment";

export default class CustomPopupDefinition {

    constructor(popupWidgetFactory, queryController, properties) {
        this.popupWidgetFactory = popupWidgetFactory;
        this.queryController = queryController;
        this.properties = properties;
    }

    resolvePopupTemplate(layerOrSublayer) {
        const that = this;
        let url = layerOrSublayer.url;
        const layerId = layerOrSublayer.layerId;
        if (layerId) {
            url = url + "/" + layerId;
        }
        const queryController = this.queryController;
        return queryController.getMetadata(url).then((metadata) => {
            if (metadata.fields) {
                const fields = metadata.fields;
                const fieldNames = fields.map(f => f.name);
                let displayField = metadata.displayField;
                let objectIdField = this._getObjectIdField(metadata.fields).name;
                return {
                    fields: fieldNames,
                    title: "{" + displayField + "}",
                    content({graphic}) {
                        if (fields) {
                            /*let widget = layerOrSublayer._$popup_widget;
                            if (!widget) {
                                widget = layerOrSublayer._$popup_widget = that.popupWidgetFactory.getWidget();
                                widget.startup();
                            }*/
                            const widget = that.popupWidgetFactory.getWidget();
                            widget.startup();

                            // The Esri API assumes that this function returns a new widget with each call.
                            // This leads to a high ram consumption
                            const sourceLayer = graphic.sourceLayer;
                            displayField = displayField || sourceLayer.displayField;
                            objectIdField = objectIdField || sourceLayer.objectIdField;
                            const objectId = graphic.attributes[objectIdField];

                            const title = graphic.attributes[displayField];
                            const items = that._lookupFieldNamesToAttributes(fields, graphic.attributes);
                            widget.set("title", title);
                            widget.set("items", items);
                            widget.set("relatedRecordsTabs", []);

                            that.getRelatedRecordsTabs(graphic.sourceLayer, objectId, widget).then((relatedRecordsTabs) => {
                                widget.set("relatedRecordsTabs", relatedRecordsTabs);
                            });
                            return widget;
                        }
                    }
                };
            }
        });
    }

    getRelatedRecordsTabs(sourceLayer, objectId, widget) {
        let url = sourceLayer.url;
        const layerId = sourceLayer.layerId;
        if (layerId) {
            url = url + "/" + layerId;
        }
        widget.set("loading", true);

        const queryController = this.queryController;
        return queryController.getMetadata(url).then((metadata) => queryController.getRelatedMetadata(url, metadata).then((relatedMetadata) => queryController.findRelatedRecords(objectId, url, metadata).then((results) => {
            const relatedRecordsTabs = [];
            if (!results) {
                widget.set("loading", false);
                return relatedRecordsTabs;
            }
            results.forEach((result, i) => {
                const relatedRecords = [];
                const metadata = relatedMetadata[i];
                const relatedRecordGroups = result.relatedRecordGroups;
                relatedRecordGroups.forEach((relatedRecordGroup) => {
                    relatedRecordGroup.relatedRecords.forEach((record) => {
                        const attributes = record.attributes;
                        const items = this._lookupFieldNamesToAttributes(metadata.fields, attributes);
                        const objectIdField = this._getObjectIdField(metadata.fields);
                        relatedRecords.push({
                            id: metadata.id + "_" + attributes[objectIdField.name],
                            title: attributes[metadata.displayField],
                            items: items
                        });
                    });
                });
                relatedRecordsTabs.push({
                    id: metadata.id,
                    title: metadata.name,
                    relatedRecords: relatedRecords,
                    active: relatedRecords[0]
                });
            });
            widget.set("loading", false);
            return relatedRecordsTabs;
        })));
    }

    _lookupFieldNamesToAttributes(fields, attributes) {
        const result = [];
        fields.forEach((field) => {
            if (!this.properties.hideFields.includes(field.name)) {
                let value = attributes[field.name];
                if (field.domain && field.domain.codedValues) {
                    const codedValues = field.domain.codedValues;
                    value = this._getCodedValue(value, codedValues);
                }
                if (field.type === "esriFieldTypeDate") {
                    value = this._getDate(value);
                }
                result.push({
                    name: field.name,
                    alias: field.alias,
                    value: value
                });
            }
        });
        return result;
    }

    _getCodedValue(value, codedValues) {
        const v = codedValues.find((codedValue) => value === codedValue.code);
        if (v) {
            return v.name;
        } else {
            return value;
        }
    }

    _getDate(value) {
        const date = moment(value);
        return date.format('dddd, Do MMMM YYYY HH:mm');
    }

    _getObjectIdField(fields) {
        return fields.find((field) => field.type === "esriFieldTypeOID");
    }

    cleanupPopupTemplate(layer) {
        const widget = layer._$popup_widget;
        delete layer._$popup_widget;
        widget && widget.destroyRecursive();
    }

}
