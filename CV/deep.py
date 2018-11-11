import argparse
import json
import math
import os
from os import path
import pymongo 
import datetime 

import cv2
import numpy as np

# initialize the list of class labels MobileNet SSD was trained to
# detect, then generate a set of bounding box colors for each class
CLASSES = ["background", "aeroplane", "bicycle", "bird", "boat",
           "bottle", "bus", "car", "cat", "chair", "cow", "diningtable",
           "dog", "horse", "motorbike", "person", "pottedplant", "sheep",
           "sofa", "train", "tvmonitor"]
CLASSES_need = ["bottle"]
COLORS = np.random.uniform(0, 255, size=(len(CLASSES), 3))


def trans_percent(n, l_0=200, l_100=30):
    if n > l_0:
        return 0
    elif n < l_100:
        return 100
    else:
        return int(round(100 * (l_0 - n) / (l_0 - l_100)))


def count_level(image, nn=100):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.threshold(blurred, 60, 255, cv2.THRESH_BINARY)[1]
    # cv2.imshow('thresh', thresh)

    thresh2 = np.round(np.mean(thresh, axis=1, keepdims=True)).astype(int).reshape((-1, 1))
    th2_t = thresh2 > 100
    th2_f = thresh2 <= 100
    thresh2[th2_t] = 255
    thresh2[th2_f] = 0
    mean_raw = np.mean(thresh2)
    # cv2.imshow('thresh2', thresh2)

    return trans_percent(mean_raw)


def process_image(image, net):
    image = image.copy()
    (h, w) = image.shape[:2]
    blob = cv2.dnn.blobFromImage(cv2.resize(image, (300, 300)), 0.007843, (300, 300), 127.5)

    # pass the blob through the network and obtain the detections and
    # predictions
    # print("[INFO] computing object detections...")
    net.setInput(blob)
    detections = net.forward()
    res_level = -1

    # loop over the detections
    for i in np.arange(0, detections.shape[2]):
        # extract the confidence (i.e., probability) associated with the
        # prediction
        idx = int(detections[0, 0, i, 1])
        confidence = detections[0, 0, i, 2]
        if idx >= len(CLASSES) or idx < 0:
            continue
        if CLASSES[idx] not in CLASSES_need:
            continue
            # filter out weak detections by ensuring the `confidence` is
            # greater than the minimum confidence
        if confidence > args["confidence"]:
            # extract the index of the class label from the `detections`,
            # then compute the (x, y)-coordinates of the bounding box for
            # the object
            box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            (startX, startY, endX, endY) = box.astype("int")
            endY = math.floor((endX - startX) * 1.1) + startY

            # subimage
            image2 = image[startY: endY, startX: endX]
            level = count_level(image2, nn=120)
            # print(level)

            # display the prediction
            label = "{}: {:.2f}%".format(CLASSES[idx], confidence * 100)
            # print("[INFO] {}".format(label))
            cv2.rectangle(image, (startX, startY), (endX, endY),
                          COLORS[idx], 2)
            y = startY - 15 if startY - 15 > 15 else startY + 15
            cv2.putText(image, label, (startX + 5, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS[idx], 2)

            # display line
            label_y = '{:.2f}%'.format(level)
            line_y = np.int64(endY - ((endY - startY) * level / 100))
            cv2.rectangle(image, (startX, line_y), (endX, line_y + 1),
                          COLORS[idx], 2)
            label_line_y = line_y - 15 if line_y - 15 > 15 else line_y + 15
            cv2.putText(image, label_y, (startX + 5, label_line_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLORS[idx], 2)
            res_level = max(res_level, level)
    return image, res_level


# construct the argument parse and parse the arguments
ap = argparse.ArgumentParser()
ap.add_argument("-i", "--image",
                help="path to input image")
ap.add_argument("-p", "--prototxt", default=path.join(path.dirname(__file__),'deploy.prototxt.txt'),
                help="path to Caffe 'deploy' prototxt file")
ap.add_argument("-m", "--model", default=path.join(path.dirname(__file__),'deploy.caffemodel'),
                help="path to Caffe pre-trained model")
ap.add_argument("-c", "--confidence", type=float, default=0.2,
                help="minimum probability to filter weak detections")
ap.add_argument("-d", "--dir", help="dir with images")
ap.add_argument("-o", "--out", help="out image")
ap.add_argument("-v", "--view", help="view images", action='store_true')
ap.add_argument("-b", "--base", help="add to db", action='store_true')
args = vars(ap.parse_args())

net = cv2.dnn.readNetFromCaffe(args["prototxt"], args["model"])

if args["image"] is not None:
    image = cv2.imread(args["image"])
    image, level = process_image(image, net)
    if args['base']:
        myclient = pymongo.MongoClient("mongodb://localhost:27017/")
        mydb = myclient["bot"]
        mycol = mydb["dayLog"]
        now = datetime.datetime.now()
        timeNow = now.strftime('%Y-%m-%dT%H:%M:%S') + ('.%03d' % (now.microsecond / 10000))+('Z')

        mydict = { "machineID": 1, "value": level, "time": timeNow } 
        x = mycol.insert_one(mydict)
    if args['out']:
        cv2.imwrite(args['out'], image)
    if args['view']:
        # show the output image
        cv2.imshow("Output: {}".format(level), image)
        while ord('q') != cv2.waitKey(1) & 0xFF:
            pass
        cv2.destroyAllWindows()

if args["dir"]:
    d = {}
    out = open(args["dir"] + '.csv', 'w')
    try:
        for dir, dirs, files in os.walk(args['dir']):
            for f_name in files:
                name = path.join(dir, f_name)
                s = f"{f_name},"
                level = -1
                image = cv2.imread(name)
                try:
                    _, level = process_image(image, net)
                    s += str(level)
                except cv2.error:
                    s += str('error!!!')
                except Exception as e:
                    print(e)
                d[f_name] = level
                print(s)
                out.write(s + '\n')
                out.flush()
    finally:
        out.close()
    # print(json.dumps(d))
